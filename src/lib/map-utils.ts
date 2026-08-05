import * as turf from '@turf/turf';
import type { LineString, Position } from 'geojson';
import type { Waypoint } from './store';

interface DirectionsResponse {
    routes?: { geometry: LineString }[];
}

/**
 * Identifies a route by only the fields its geometry depends on.
 *
 * Renaming a stop or changing its emoji cannot move the line, so those must
 * not invalidate the cache — otherwise every keystroke in a city name field
 * re-requests every ground segment from the Directions API.
 */
export const routeCacheKey = (waypoints: Waypoint[]): string =>
    waypoints.map((wp) => `${wp.lng},${wp.lat},${wp.transport}`).join('|');

// Async Smart Route Generation (Directions API)
export const generateSmartRoute = async (waypoints: Waypoint[]) => {
    if (waypoints.length < 2) return [];

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const segmentPromises = waypoints.slice(0, -1).map(async (start, i) => {
        const end = waypoints[i + 1];
        const startPt = [start.lng, start.lat];
        const endPt = [end.lng, end.lat];

        let coordinates: Position[] = [];

        // 1. Plane (Great Circle)
        if (start.transport === 'plane') {
            const geometry = turf.greatCircle(startPt, endPt, { npoints: 200 }).geometry;
            if (geometry.type === 'MultiLineString') {
                // The great circle is split into two lines when it crosses the dateline.
                geometry.coordinates.forEach((c) => coordinates.push(...c));
            } else {
                coordinates = geometry.coordinates;
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
                const data: DirectionsResponse = await res.json();

                if (data.routes && data.routes.length > 0) {
                    const rawGeo = data.routes[0].geometry;
                    // Simplify route to reduce camera jitter on winding roads
                    // Tolerance 0.001 is approx 100m precision, good balance for world scale
                    const simplified = turf.simplify(turf.feature(rawGeo), { tolerance: 0.001, highQuality: true });
                    coordinates = simplified.geometry.coordinates;
                } else {
                    throw new Error("No route found");
                }
            } catch (e) {
                console.warn(`Directions API failed for ${start.name}->${end.name}, falling back to straight line.`, e);
                // Fallback: great circle still looks right at ground distances.
                const fallback = turf.greatCircle(startPt, endPt, { npoints: 50 }).geometry;
                coordinates = fallback.type === 'MultiLineString'
                    ? fallback.coordinates.flat()
                    : fallback.coordinates;
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

/**
 * Unwraps longitudes so no two consecutive points jump more than 180°.
 *
 * Without this, a route crossing the antimeridian (179° → -179°) reads as a
 * near-complete trip the wrong way around the planet, and the line is drawn
 * straight across the whole map.
 *
 * Returns a new array — callers cache the result, so mutating in place would
 * corrupt anything already holding it.
 */
export const fixDatelineCrossing = (coords: Position[]): Position[] => {
    if (coords.length === 0) return [];

    const out: Position[] = [[...coords[0]]];

    for (let i = 1; i < coords.length; i++) {
        const prevLon = out[i - 1][0];
        let currLon = coords[i][0];

        let diff = currLon - prevLon;
        while (diff > 180) { currLon -= 360; diff -= 360; }
        while (diff < -180) { currLon += 360; diff += 360; }

        out.push([currLon, ...coords[i].slice(1)]);
    }

    return out;
};

export const getFlagEmoji = (countryCode: string) => {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
};
