// @ts-ignore
import * as turf from '@turf/turf';
import { Waypoint } from './store';

// Async Smart Route Generation (Directions API)
export const generateSmartRoute = async (waypoints: Waypoint[]) => {
    if (waypoints.length < 2) return [];

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const segmentPromises = waypoints.slice(0, -1).map(async (start, i) => {
        const end = waypoints[i + 1];
        const startPt = [start.lng, start.lat];
        const endPt = [end.lng, end.lat];

        let coordinates: number[][] = [];

        // 1. Plane (Great Circle)
        if (start.transport === 'plane') {
            const geometry = turf.greatCircle(startPt, endPt, { npoints: 200 }).geometry;
            if (geometry.type === 'MultiLineString') {
                (geometry as any).coordinates.forEach((c: any) => coordinates.push(...c));
            } else {
                coordinates = geometry.coordinates as number[][];
            }
        }
        // 2. Ground (Directions API)
        else {
            try {
                let profile = 'driving';
                if (start.transport === 'walk') profile = 'walking';
                // 'train' maps to 'driving' for now as transit is not standard in Directions API (only standard driving/walking/cycling)

                const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${token}`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.routes && data.routes.length > 0) {
                    const rawGeo = data.routes[0].geometry;
                    // Simplify route to reduce camera jitter on winding roads
                    // Tolerance 0.001 is approx 100m precision, good balance for world scale
                    const simplified = turf.simplify(turf.feature(rawGeo), { tolerance: 0.001, highQuality: true });
                    coordinates = (simplified.geometry as any).coordinates;
                } else {
                    throw new Error("No route found");
                }
            } catch (e) {
                console.warn(`Directions API failed for ${start.name}->${end.name}, falling back to straight line.`, e);
                // Fallback: Direct Line (not greatCircle for short ground distance? actually greatCircle is fine)
                // Use simple straight line for very short text? no, greatCircle is safe.
                coordinates = turf.greatCircle(startPt, endPt, { npoints: 50 }).geometry.coordinates as number[][];
            }
        }

        return coordinates;
    });

    const segments = await Promise.all(segmentPromises);
    const coords: number[][] = [];

    // Stitch segments
    segments.forEach((seg, i) => {
        if (i > 0) seg.shift(); // Remove duplicate point from previous segment end
        coords.push(...seg);
    });

    return fixDatelineCrossing(coords);
};

// Helper: Ensure Longitude Continuity (Global Unwrap)
export const fixDatelineCrossing = (coords: number[][]) => {
    for (let i = 1; i < coords.length; i++) {
        const prevLon = coords[i - 1][0];
        let currLon = coords[i][0];

        let diff = currLon - prevLon;
        while (diff > 180) { currLon -= 360; diff -= 360; }
        while (diff < -180) { currLon += 360; diff += 360; }

        coords[i][0] = currLon;
    }
    return coords;
};

// Deprecated: Sync version kept for fallback init
export const generateFullRoute = (waypoints: Waypoint[]) => {
    if (waypoints.length < 2) return [];
    const coords: number[][] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];
        const startPt = [start.lng, start.lat];
        const endPt = [end.lng, end.lat];

        let segment: number[][] = [];
        if (start.transport === 'plane') {
            const geometry = turf.greatCircle(startPt, endPt, { npoints: 200 }).geometry;
            if (geometry.type === 'MultiLineString') {
                const rawCoords = (geometry as any).coordinates as number[][][];
                rawCoords.forEach(c => segment.push(...c));
            } else {
                segment = geometry.coordinates as number[][];
            }
        } else {
            segment = [startPt, endPt];
        }

        if (i > 0) segment.shift();
        coords.push(...segment);
    }

    return fixDatelineCrossing(coords);
};

export const getFlagEmoji = (countryCode: string) => {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
};
