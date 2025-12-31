"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
// @ts-ignore
import * as turf from "@turf/turf";
import * as THREE from "three";
import { useEditorStore } from "@/lib/store";
import { generateFullRoute, getFlagEmoji, generateSmartRoute } from "@/lib/map-utils";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

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
    mapRef?: React.RefObject<MapCanvasHandle>;
}

const MapCanvas: React.FC<MapCanvasProps> = ({ mapRef }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRefInternal = useRef<mapboxgl.Map | null>(null);
    const animationFrameRef = useRef<number>();
    const lastBearingRef = useRef(0);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const { waypoints, isPlaying, setPlaying, mapStyle } = useEditorStore();

    // Helper: Lerp Angle (handles 360 wrap)
    const lerpAngle = (start: number, end: number, t: number) => {
        const dt = (end - start + 540) % 360 - 180;
        return start + dt * t;
    };

    // Imperative Handle for Export
    useImperativeHandle(mapRef, () => {
        console.log("MapCanvas: imperative handle attached");
        return {
            captureStream: () => {
                console.log("MapCanvas: captureStream called");
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
        if (mapRefInternal.current || !mapContainer.current) return;

        mapRefInternal.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: mapStyle,
            center: [127.0, 37.5],
            zoom: 3,
            pitch: 0, // Start flat
            projection: "globe",
            preserveDrawingBuffer: true,
            attributionControl: false,
            antialias: true
        });

        mapRefInternal.current.on("load", () => {
            initLayers(mapRefInternal.current!);

            // Interactions
            mapRefInternal.current!.on("click", async (e) => {
                if (useEditorStore.getState().isPlaying) return;
                const { lng, lat } = e.lngLat;

                let name = "Stop";
                let emoji = "🏳️"; // Default to flag-ish if country unknown
                try {
                    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxgl.accessToken}&types=place,country&limit=1`);
                    const data = await res.json();
                    if (data.features && data.features.length > 0) {
                        const feature = data.features[0];
                        name = feature.text;
                        const countryContext = feature.context?.find((c: any) => c.id.startsWith('country')) || (feature.id.startsWith('country') ? feature : null);
                        if (countryContext && countryContext.short_code) {
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

            setIsMapLoaded(true);
        });
    }, []);

    const [routePath, setRoutePath] = useState<number[][]>([]);

    const bakedEmojisRef = useRef(new Set<string>());

    const lastWaypointsStringRef = useRef("");
    const cachedPathRef = useRef<number[][]>([]);

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

        // Generate Route (Cache Check)
        const wpString = JSON.stringify(waypoints);
        let path: number[][] = [];

        if (wpString === lastWaypointsStringRef.current && cachedPathRef.current.length > 0) {
            path = cachedPathRef.current;
        } else {
            path = await generateSmartRoute(waypoints);
            lastWaypointsStringRef.current = wpString;
            cachedPathRef.current = path;
            setRoutePath(path);
        }

        const validPath = path.filter(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]));

        // Sync Source Data

        // A. Preview Route (Untraveled)
        if (map.getSource('route-preview')) {
            const geoData = (isPlaying && validPath.length > 1)
                ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: validPath } }
                : { type: 'FeatureCollection', features: [] };
            (map.getSource('route-preview') as any).setData(geoData);
        }

        // B. Active Route (Traveled)
        if (map.getSource('route-active')) {
            // ONLY show full path if NOT playing. 
            const geoData = (!isPlaying && validPath.length > 1)
                ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: validPath } }
                : { type: 'FeatureCollection', features: [] };
            (map.getSource('route-active') as any).setData(geoData);
        }

        if (map.getSource('markers')) {
            const markerFeatures = waypoints.map(wp => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [wp.lng, wp.lat] },
                properties: {
                    iconId: `emoji-${wp.emoji || '📍'}`,
                    size: isPlaying ? 0 : 1, // Hide markers initially if playing (they pop in during animate)
                    name: wp.name
                }
            }));
            (map.getSource('markers') as any).setData({ type: 'FeatureCollection', features: markerFeatures });
        }

        // Fit Bounds (Only on static state or initial load)
        if (!isPlaying && validPath.length > 0) {
            const bounds = validPath.reduce((b, c) => b.extend(c as [number, number]), new mapboxgl.LngLatBounds(validPath[0] as [number, number], validPath[0] as [number, number]));
            map.fitBounds(bounds, { padding: 100, pitch: 0, bearing: 0 });
        }
    }, [waypoints, isPlaying, isMapLoaded]);

    const lastStyleRef = useRef(mapStyle);

    // 2. Handle Style Change (with layer restore)
    useEffect(() => {
        if (!mapRefInternal.current || !isMapLoaded) return;
        const map = mapRefInternal.current;

        // Only update if style actually changed to prevent wiping layers on init
        if (mapStyle !== lastStyleRef.current) {
            lastStyleRef.current = mapStyle;
            map.setStyle(mapStyle);
            map.once('style.load', () => {
                initLayers(map);
                updateMapData();
            });
        }
    }, [mapStyle, isMapLoaded, updateMapData]);

    // 3. Data Sync & Smart Routing (Async)
    useEffect(() => {
        updateMapData();
    }, [updateMapData]);

    // 4. Animation Loop Logic (Vertex-Walker Engine v1.0)
    // --- OPTIMIZATION: Memoize Path Data ---
    const pathData = React.useMemo(() => {
        if (routePath.length < 2) return null;

        // 1. Base Line
        let baseLine: any;
        try { baseLine = turf.lineString(routePath as any); } catch (e) { return null; }
        const totalLen = turf.length(baseLine);

        // 2. Interpolated Path (High-Res)
        const stepSize = 5;
        const totalSteps = Math.ceil(totalLen / stepSize);
        const interpolatedPath: [number, number][] = [];

        for (let i = 0; i <= totalSteps; i++) {
            const dist = (i / totalSteps) * totalLen;
            const pt = turf.along(baseLine, dist);
            interpolatedPath.push(pt.geometry.coordinates as [number, number]);
        }

        // 3. Timing Data (Robust Cumulative)
        const waypointDistances = [0];
        let runningDist = 0;
        let lastIndex = 0;

        for (let i = 1; i < waypoints.length; i++) {
            const target = turf.point([waypoints[i].lng, waypoints[i].lat]);
            let bestIdx = lastIndex;
            let minD = Infinity;

            for (let j = lastIndex; j < routePath.length; j++) {
                const d = turf.distance(target, turf.point(routePath[j] as any));
                if (d < minD) { minD = d; bestIdx = j; }
            }

            const segmentCoords = routePath.slice(lastIndex, bestIdx + 1);
            if (segmentCoords.length > 1) {
                runningDist += turf.length(turf.lineString(segmentCoords as any));
            }
            waypointDistances.push(runningDist);
            lastIndex = bestIdx;
        }

        const segmentDuration = 2500;
        const totalDuration = (waypoints.length - 1) * segmentDuration;

        return { baseLine, totalLen, interpolatedPath, waypointDistances, totalDuration, segmentDuration };
    }, [routePath, waypoints]);

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
                    const sActive = mapRefInternal.current.getSource('route-active') as any;
                    const sPreview = mapRefInternal.current.getSource('route-preview') as any;
                    if (sActive) sActive.setData(baseLine);
                    if (sPreview) sPreview.setData({ type: 'FeatureCollection', features: [] });
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
                const sActive = mapRefInternal.current.getSource('route-active') as any;
                const sPreview = mapRefInternal.current.getSource('route-preview') as any;
                const sPoint = mapRefInternal.current.getSource('point') as any;

                // Active Path (History)
                if (sActive && safeIndex > 0) {
                    const activeSlice = interpolatedPath.slice(0, safeIndex + 1);
                    if (activeSlice.length >= 2) {
                        sActive.setData({
                            type: 'Feature', properties: {},
                            geometry: { type: 'LineString', coordinates: activeSlice }
                        });
                    }
                }

                // Preview Path (Future)
                if (sPreview) {
                    const previewSlice = interpolatedPath.slice(safeIndex);
                    // Single point overlap ensures connectivity without visual doubling
                    if (previewSlice.length >= 2) {
                        sPreview.setData({
                            type: 'Feature', properties: {},
                            geometry: { type: 'LineString', coordinates: previewSlice }
                        });
                    } else {
                        sPreview.setData({ type: 'FeatureCollection', features: [] });
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

                    sPoint.setData({
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            properties: { bearing, icon: `transport-${transport}` },
                            geometry: { type: 'Point', coordinates: coords }
                        }]
                    });

                    // Camera Follow
                    const camView = useEditorStore.getState().cameraView;
                    const smoothedBearing = lerpAngle(lastBearingRef.current, bearing, 0.1);
                    lastBearingRef.current = smoothedBearing;

                    if (camView !== 'global') {
                        const cameraOptions: any = { center: coords, duration: 0, bearing: smoothedBearing };
                        if (camView === 'top') { cameraOptions.zoom = 4; cameraOptions.pitch = 0; }
                        else if (camView === 'side') {
                            const sidePt = turf.destination(p1, 200, smoothedBearing - 90, { units: 'kilometers' });
                            cameraOptions.center = sidePt.geometry.coordinates;
                            cameraOptions.zoom = 4.5; cameraOptions.pitch = 65; cameraOptions.bearing = smoothedBearing + 90;
                        } else { // Follow
                            const backPt = turf.destination(p1, 400, smoothedBearing + 180, { units: 'kilometers' });
                            cameraOptions.center = backPt.geometry.coordinates;
                            cameraOptions.zoom = 4.2; cameraOptions.pitch = 55;
                        }
                        mapRefInternal.current.easeTo(cameraOptions);
                    }
                }
            }

            // 5. Marker Logic
            let markersUpdated = false;
            waypoints.forEach((wp, i) => {
                if (visitedSet.has(wp.id)) return;
                const distToWp = turf.distance(turf.point(coords), [wp.lng, wp.lat]);
                if (distToWp < 500) {
                    visitedSet.add(wp.id);
                    markersUpdated = true;
                }
            });

            if (markersUpdated && mapRefInternal.current?.getSource('markers')) {
                const markerFeatures = waypoints.map((wp, i) => {
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
                (mapRefInternal.current.getSource('markers') as any).setData({ type: 'FeatureCollection', features: markerFeatures });
            }

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    }, [isPlaying, isMapLoaded, pathData, setPlaying, waypoints]); // Ensure deps are correct

    return <div ref={mapContainer} className="w-full h-full bg-gray-50" />;
};

MapCanvas.displayName = "MapCanvas";
export default MapCanvas;
