"use client";

import React, { useEffect, useRef, useImperativeHandle, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, LineString, Point, Position } from "geojson";
import { useEditorStore } from "@/lib/store";
import { getFlagEmoji, generateSmartRoute, routeCacheKey } from "@/lib/map-utils";
import { buildPathData } from "@/lib/animation";

/** Wait for edits to settle before paying for Directions API requests. */
const ROUTE_DEBOUNCE_MS = 300;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

mapboxgl.accessToken = MAPBOX_TOKEN;

const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

const lineFeature = (coordinates: Position[]): Feature<LineString> => ({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
});

const geoSource = (map: mapboxgl.Map, id: string) =>
    map.getSource(id) as mapboxgl.GeoJSONSource | undefined;

/** GeoJSON `Position` is number[]; Mapbox wants a fixed-length lng/lat pair. */
const toLngLat = (position: Position): [number, number] => [position[0], position[1]];

/** Shape of the Mapbox Geocoding v5 features we actually read. */
interface GeocodingFeature {
    id: string;
    text: string;
    context?: { id: string; short_code?: string }[];
    properties?: { short_code?: string };
}

const createEmojiImage = (emoji: string): HTMLImageElement => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; // Retina
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        let fontSize = 100;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Auto-scale font if text is too wide (for multi-emoji strings)
        const maxWidth = 118;
        let textWidth = ctx.measureText(emoji || '📍').width;
        while (textWidth > maxWidth && fontSize > 20) {
            fontSize -= 5;
            ctx.font = `${fontSize}px sans-serif`;
            textWidth = ctx.measureText(emoji || '📍').width;
        }

        ctx.fillText(emoji || '📍', 64, 70);
    }
    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
};

export interface MapCanvasHandle {
    captureStream: () => MediaStream | null;
}

interface MapCanvasProps {
    // React 19 types make refs nullable, so the handle must be too.
    mapRef?: React.RefObject<MapCanvasHandle | null>;
    /** Background usage: stay silent when the map can't be shown. */
    decorative?: boolean;
}

const MapCanvas: React.FC<MapCanvasProps> = ({ mapRef, decorative = false }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRefInternal = useRef<mapboxgl.Map | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const lastBearingRef = useRef(0);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    // Lets the style.load handler, which is registered once at mount, reach the
    // current updateMapData without capturing a stale closure.
    const redrawRef = useRef<() => void>(() => { });
    const { waypoints, isPlaying, setPlaying, mapStyle } = useEditorStore();

    // Helper: Lerp Angle (handles 360 wrap)
    const lerpAngle = (start: number, end: number, t: number) => {
        const dt = (end - start + 540) % 360 - 180;
        return start + dt * t;
    };

    // Imperative Handle for Export
    useImperativeHandle(mapRef, () => {
        return {
            captureStream: () => {
                const canvas = mapContainer.current?.querySelector("canvas");
                if (!canvas) {
                    console.error("MapCanvas: No canvas found for captureStream");
                    return null;
                }
                return canvas.captureStream(60);
            },
        };
    }, []);

    // Helper: Initialize Layers
    const initLayers = (map: mapboxgl.Map) => {
        // Atmosphere & Terrain
        map.setFog({
            color: 'rgb(255, 255, 255)',
            'high-color': 'rgb(200, 200, 225)',
            'horizon-blend': 0.2,
            'space-color': 'rgb(150, 150, 170)',
            'star-intensity': 0.0
        });

        if (!map.getSource("mapbox-dem")) {
            map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.terrain-rgb", tileSize: 512, maxzoom: 14 });
            map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
        }

        // Sources
        const sources = ['route-full', 'route-active', 'route-preview', 'markers', 'point'];
        sources.forEach(id => {
            if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        });

        // 1. Background Reference (Disjoint Preview)
        if (!map.getLayer('line-bg')) {
            map.addLayer({
                id: 'line-bg', type: 'line', source: 'route-preview',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.2 } // Increased opacity since no overlap
            });
        }

        // 2. Active Trail (Snake Effect)
        if (!map.getLayer('line-active')) {
            map.addLayer({
                id: 'line-active', type: 'line', source: 'route-active',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#2563eb', 'line-width': 6 } // Bright Blue
            });
        }

        // 3. Emoji Markers (Pop Animation)
        if (!map.getLayer('emoji-symbol')) {
            map.addLayer({
                id: 'emoji-symbol',
                type: 'symbol',
                source: 'markers',
                layout: {
                    'icon-image': ['get', 'iconId'],
                    'icon-size': [
                        'interpolate', ['linear'], ['get', 'size'],
                        0, 0,
                        0.5, 0.8,
                        1, 0.6
                    ],
                    'icon-allow-overlap': true,
                    'icon-anchor': 'bottom',
                    'icon-offset': [0, 5],
                    'text-field': ['get', 'name'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 14,
                    'text-anchor': 'top',
                    'text-offset': [0, 0.5],
                    'text-allow-overlap': true,
                    'text-ignore-placement': true
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': 'rgba(0,0,0,0.8)',
                    'text-halo-width': 2,
                    'text-opacity': ['step', ['get', 'size'], 0, 0.1, 1]
                }
            });
        }

        // 4. Vehicle Icons (Plane, Car, Train, Walk)
        const transportIcons: Record<string, string> = {
            'plane': '✈️',
            'car': '🚗',
            'train': '🚂',
            'walk': '🚶'
        };

        Object.entries(transportIcons).forEach(([key, emoji]) => {
            const imgId = `transport-${key}`;
            if (!map.hasImage(imgId)) {
                const img = createEmojiImage(emoji);
                img.onload = () => { if (!map.hasImage(imgId)) map.addImage(imgId, img); };
            }
        });

        if (!map.getLayer("plane-point")) {
            map.addLayer({
                id: 'plane-point', type: 'symbol', source: 'point',
                layout: {
                    'icon-image': ['get', 'icon'], // Data-driven icon
                    'icon-size': 0.5,
                    'icon-rotate': ['get', 'bearing'],
                    'icon-rotation-alignment': 'map',
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true
                },
                paint: {
                    'icon-opacity': 1
                }
            });
        }
    };

    // 1. Initialize Map
    useEffect(() => {
        if (!MAPBOX_TOKEN) return;
        if (mapRefInternal.current || !mapContainer.current) return;

        try {
            mapRefInternal.current = new mapboxgl.Map({
                container: mapContainer.current,
                // Read once at mount — later style changes are handled by the effect below.
                style: useEditorStore.getState().mapStyle,
                center: [127.0, 37.5],
                zoom: 3,
                pitch: 0, // Start flat
                projection: "globe",
                preserveDrawingBuffer: true,
                attributionControl: false,
                antialias: true
            });
        } catch (err) {
            // A bad token or a browser without WebGL would otherwise take the
            // whole page down with it.
            console.error("Mapbox failed to initialise:", err);
            mapRefInternal.current = null;
            return;
        }

        mapRefInternal.current.on("error", (e) => {
            console.error("Mapbox error:", e.error ?? e);
        });

        // `style.load`, not `load`: adding sources and layers only needs the
        // style, whereas `load` additionally waits for a first visually
        // complete frame — which never arrives in a throttled or hidden tab,
        // leaving the route and markers permanently undrawn. This also matches
        // what the style-change handler below already does.
        // Registered once, outside the style handler below: `style.load` fires
        // again on every style change, and re-registering here would add a
        // duplicate waypoint per click.
        mapRefInternal.current.on("click", async (e) => {
            if (useEditorStore.getState().isPlaying) return;
            const { lng, lat } = e.lngLat;

            let name = "Stop";
            let emoji = "🏳️"; // Default to flag-ish if country unknown
            try {
                const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}&types=place,country&limit=1`);
                const data: { features?: GeocodingFeature[] } = await res.json();
                if (data.features && data.features.length > 0) {
                    const feature = data.features[0];
                    name = feature.text;
                    const countryContext = feature.context?.find((c) => c.id.startsWith('country'));
                    if (countryContext?.short_code) {
                        emoji = getFlagEmoji(countryContext.short_code);
                    } else if (feature.properties?.short_code) {
                        emoji = getFlagEmoji(feature.properties.short_code);
                    }
                }
            } catch (err) {
                console.error("Reverse geocoding failed:", err);
            }

            useEditorStore.getState().addWaypoint({
                id: crypto.randomUUID(),
                name: name, lat, lng, transport: "plane", emoji
            });
        });

        // Fires on first load and again after every setStyle, which wipes all
        // custom sources and layers — so this is also the style-change repair.
        mapRefInternal.current.on("style.load", () => {
            initLayers(mapRefInternal.current!);
            setIsMapLoaded(true);
            // Re-push the route data a style change discarded. On the very
            // first load this is a no-op — isMapLoaded is still false — and the
            // data effect covers it once that state lands.
            redrawRef.current();
        });

        return () => {
            mapRefInternal.current?.remove();
            mapRefInternal.current = null;
            setIsMapLoaded(false);
        };
    }, []);

    const [routePath, setRoutePath] = useState<number[][]>([]);

    const bakedEmojisRef = useRef(new Set<string>());

    // Only the coordinates and transport modes can move the line, so renaming a
    // stop or changing its emoji must not trigger a fresh round of Directions
    // API requests.
    const routeKey = React.useMemo(() => routeCacheKey(waypoints), [waypoints]);

    useEffect(() => {
        let cancelled = false;

        // Debounced so dragging a stop or editing coordinates settles before we
        // pay for a route. Waypoints are read from the store when the timer
        // fires rather than captured, so this effect stays keyed on routeKey.
        const timer = setTimeout(async () => {
            const path = await generateSmartRoute(useEditorStore.getState().waypoints);
            if (!cancelled) setRoutePath(path);
        }, ROUTE_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [routeKey]);

    const updateMapData = React.useCallback(async () => {
        if (!mapRefInternal.current || !isMapLoaded) return;
        const map = mapRefInternal.current;

        // Bake Emojis
        waypoints.forEach(wp => {
            const imageId = `emoji-${wp.emoji || '📍'}`;
            if (!map.hasImage(imageId)) {
                const img = createEmojiImage(wp.emoji || '📍');
                img.onload = () => { if (!map.hasImage(imageId)) map.addImage(imageId, img); };
                bakedEmojisRef.current.add(imageId);
            }
        });

        // The route itself is produced by the debounced effect above; this
        // function only renders whatever it last produced.
        const validPath = routePath.filter(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]));

        // Sync Source Data

        // A. Preview Route (Untraveled)
        geoSource(map, 'route-preview')?.setData(
            (isPlaying && validPath.length > 1) ? lineFeature(validPath) : EMPTY_COLLECTION
        );

        // B. Active Route (Traveled) — only show the full path while paused.
        geoSource(map, 'route-active')?.setData(
            (!isPlaying && validPath.length > 1) ? lineFeature(validPath) : EMPTY_COLLECTION
        );

        const markerFeatures: Feature<Point>[] = waypoints.map(wp => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [wp.lng, wp.lat] },
            properties: {
                iconId: `emoji-${wp.emoji || '📍'}`,
                size: isPlaying ? 0 : 1, // Hide markers initially if playing (they pop in during animate)
                name: wp.name
            }
        }));
        geoSource(map, 'markers')?.setData({ type: 'FeatureCollection', features: markerFeatures });

        // Fit Bounds (Only on static state or initial load)
        if (!isPlaying && validPath.length > 0) {
            const bounds = validPath.reduce((b, c) => b.extend(c as [number, number]), new mapboxgl.LngLatBounds(validPath[0] as [number, number], validPath[0] as [number, number]));
            map.fitBounds(bounds, { padding: 100, pitch: 0, bearing: 0 });
        }
    }, [waypoints, isPlaying, isMapLoaded, routePath]);

    const lastStyleRef = useRef(mapStyle);

    // 2. Handle Style Change. Rebuilding the layers afterwards is the
    // `style.load` handler's job, so this only has to swap the style.
    useEffect(() => {
        if (!mapRefInternal.current || !isMapLoaded) return;
        const map = mapRefInternal.current;

        // Only update if style actually changed to prevent wiping layers on init
        if (mapStyle !== lastStyleRef.current) {
            lastStyleRef.current = mapStyle;
            map.setStyle(mapStyle);
        }
    }, [mapStyle, isMapLoaded]);

    useEffect(() => {
        redrawRef.current = updateMapData;
    }, [updateMapData]);

    // 3. Data Sync & Smart Routing (Async)
    useEffect(() => {
        updateMapData();
    }, [updateMapData]);

    // 4. Animation Loop Logic (Vertex-Walker Engine v1.0)
    // --- OPTIMIZATION: Memoize Path Data ---
    const pathData = React.useMemo(
        () => buildPathData(routePath, waypoints),
        [routePath, waypoints]
    );

    // 4. Animation Loop
    useEffect(() => {
        if (!isPlaying || !isMapLoaded || !pathData) return;

        const { baseLine, totalLen, interpolatedPath, waypointDistances, totalDuration, segmentDuration } = pathData;
        const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        let start: number;
        const visitedSet = new Set<string>();
        const animate = (timestamp: number) => {
            if (!start) start = timestamp;
            const elapsed = timestamp - start;

            // 1. Finish Check
            if (elapsed >= totalDuration) {
                if (mapRefInternal.current) {
                    geoSource(mapRefInternal.current, 'route-active')?.setData(baseLine);
                    geoSource(mapRefInternal.current, 'route-preview')?.setData(EMPTY_COLLECTION);
                }
                setPlaying(false);
                return;
            }

            // 2. Timing Logic (v9 Stop & Go)
            const currentSegIndex = Math.min(Math.floor(elapsed / segmentDuration), waypoints.length - 2);
            const segProgressRaw = (elapsed % segmentDuration) / segmentDuration;
            const segProgress = ease(segProgressRaw);

            const startDist = waypointDistances[currentSegIndex];
            const endDist = waypointDistances[currentSegIndex + 1];
            const currentDist = startDist + (endDist - startDist) * segProgress;

            // 3. Vertex Mapping
            // Map distance to the nearest vertex index
            const rawIndex = (currentDist / totalLen) * (interpolatedPath.length - 1);
            const currentIndex = Math.floor(rawIndex);

            // Safety: Clamp index
            const safeIndex = Math.max(0, Math.min(currentIndex, interpolatedPath.length - 1));
            const coords = interpolatedPath[safeIndex];

            // 4. Render Disjoint Layers (Vertex Slicing)
            if (mapRefInternal.current) {
                const sActive = geoSource(mapRefInternal.current, 'route-active');
                const sPreview = geoSource(mapRefInternal.current, 'route-preview');
                const sPoint = geoSource(mapRefInternal.current, 'point');

                // Active Path (History)
                if (sActive && safeIndex > 0) {
                    const activeSlice = interpolatedPath.slice(0, safeIndex + 1);
                    if (activeSlice.length >= 2) {
                        sActive.setData(lineFeature(activeSlice));
                    }
                }

                // Preview Path (Future)
                if (sPreview) {
                    const previewSlice = interpolatedPath.slice(safeIndex);
                    // Single point overlap ensures connectivity without visual doubling
                    if (previewSlice.length >= 2) {
                        sPreview.setData(lineFeature(previewSlice));
                    } else {
                        sPreview.setData(EMPTY_COLLECTION);
                    }
                }

                // Plane Icon & Bearing
                if (sPoint) {
                    // Look ahead for bearing using the vertex array
                    const lookAheadIndex = Math.min(safeIndex + 5, interpolatedPath.length - 1);
                    const p1 = turf.point(coords);
                    const p2 = turf.point(interpolatedPath[lookAheadIndex]);
                    const bearing = safeIndex === lookAheadIndex ? lastBearingRef.current : turf.bearing(p1, p2);

                    const transport = waypoints[currentSegIndex]?.transport || 'plane';

                    const pointFeature: Feature<Point> = {
                        type: 'Feature',
                        properties: { bearing, icon: `transport-${transport}` },
                        geometry: { type: 'Point', coordinates: coords }
                    };
                    sPoint.setData({ type: 'FeatureCollection', features: [pointFeature] });

                    // Camera Follow
                    const camView = useEditorStore.getState().cameraView;
                    const smoothedBearing = lerpAngle(lastBearingRef.current, bearing, 0.1);
                    lastBearingRef.current = smoothedBearing;

                    if (camView !== 'global') {
                        const cameraOptions: NonNullable<Parameters<mapboxgl.Map['easeTo']>[0]> = { center: coords, duration: 0, bearing: smoothedBearing };
                        if (camView === 'top') { cameraOptions.zoom = 4; cameraOptions.pitch = 0; }
                        else if (camView === 'side') {
                            const sidePt = turf.destination(p1, 200, smoothedBearing - 90, { units: 'kilometers' });
                            cameraOptions.center = toLngLat(sidePt.geometry.coordinates);
                            cameraOptions.zoom = 4.5; cameraOptions.pitch = 65; cameraOptions.bearing = smoothedBearing + 90;
                        } else { // Follow
                            const backPt = turf.destination(p1, 400, smoothedBearing + 180, { units: 'kilometers' });
                            cameraOptions.center = toLngLat(backPt.geometry.coordinates);
                            cameraOptions.zoom = 4.2; cameraOptions.pitch = 55;
                        }
                        mapRefInternal.current.easeTo(cameraOptions);
                    }
                }
            }

            // 5. Marker Logic
            let markersUpdated = false;
            waypoints.forEach((wp) => {
                if (visitedSet.has(wp.id)) return;
                const distToWp = turf.distance(turf.point(coords), [wp.lng, wp.lat]);
                if (distToWp < 500) {
                    visitedSet.add(wp.id);
                    markersUpdated = true;
                }
            });

            const markerSource = mapRefInternal.current
                ? geoSource(mapRefInternal.current, 'markers')
                : undefined;

            if (markersUpdated && markerSource) {
                const markerFeatures: Feature<Point>[] = waypoints.map((wp, i) => {
                    const isVisited = visitedSet.has(wp.id);
                    let displayName = wp.name;

                    if (isVisited && i > 0) {
                        const dist = waypointDistances[i] - waypointDistances[i - 1];
                        if (dist > 1) { // Only show if significant (>1km)
                            displayName += `\n+${Math.round(dist).toLocaleString()} km`;
                        }
                    }

                    return {
                        type: 'Feature', geometry: { type: 'Point', coordinates: [wp.lng, wp.lat] },
                        properties: {
                            iconId: `emoji-${wp.emoji || '📍'}`,
                            size: isVisited ? 1 : 0,
                            name: displayName
                        }
                    };
                });
                markerSource.setData({ type: 'FeatureCollection', features: markerFeatures });
            }

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    }, [isPlaying, isMapLoaded, pathData, setPlaying, waypoints]); // Ensure deps are correct

    // mapbox-gl tears the page down if it is constructed without an access
    // token, so render a placeholder instead of a map we cannot build.
    if (!MAPBOX_TOKEN) {
        if (decorative) return <div className="w-full h-full bg-zinc-950" />;

        return (
            <div className="w-full h-full bg-zinc-950 flex items-center justify-center p-8">
                <div className="max-w-md text-center space-y-3">
                    <div className="text-4xl">🗺️</div>
                    <p className="text-zinc-200 font-bold text-lg">Map unavailable</p>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Set <code className="text-zinc-300 bg-white/10 px-1.5 py-0.5 rounded">NEXT_PUBLIC_MAPBOX_TOKEN</code> in
                        your environment and redeploy to enable the map.
                    </p>
                </div>
            </div>
        );
    }

    return <div ref={mapContainer} className="w-full h-full bg-gray-50" />;
};

MapCanvas.displayName = "MapCanvas";
export default MapCanvas;
