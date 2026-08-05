import * as turf from '@turf/turf';
import type { Feature, LineString, Position } from 'geojson';
import type { Waypoint } from './store';

/** How long the camera spends travelling between two consecutive stops. */
export const SEGMENT_DURATION_MS = 2500;

/** Spacing, in kilometres, between the vertices the animation walks along.
 *  Smaller means smoother motion and more memory. */
const INTERPOLATION_STEP_KM = 5;

export interface PathData {
    baseLine: Feature<LineString>;
    totalLen: number;
    /** Evenly spaced points along the whole route — the animation walks these. */
    interpolatedPath: [number, number][];
    /** Cumulative distance along the route at which each waypoint sits.
     *  Always starts at 0 and has one entry per waypoint. */
    waypointDistances: number[];
    totalDuration: number;
    segmentDuration: number;
}

/**
 * Precomputes everything the animation loop needs from a route.
 *
 * Pure and deterministic, so the timing maths can be tested without a map.
 * Returns null when there is nothing to animate.
 */
export function buildPathData(routePath: Position[], waypoints: Waypoint[]): PathData | null {
    if (routePath.length < 2) return null;

    let baseLine: Feature<LineString>;
    try {
        baseLine = turf.lineString(routePath);
    } catch {
        return null;
    }

    const totalLen = turf.length(baseLine);
    if (!Number.isFinite(totalLen) || totalLen <= 0) return null;

    const totalSteps = Math.ceil(totalLen / INTERPOLATION_STEP_KM);
    const interpolatedPath: [number, number][] = [];

    for (let i = 0; i <= totalSteps; i++) {
        const dist = (i / totalSteps) * totalLen;
        const pt = turf.along(baseLine, dist);
        interpolatedPath.push(pt.geometry.coordinates as [number, number]);
    }

    // Walk the route once, snapping each waypoint to its nearest vertex at or
    // after the previous waypoint's. Scanning forward only keeps a route that
    // doubles back from matching an earlier vertex.
    const waypointDistances = [0];
    let runningDist = 0;
    let lastIndex = 0;

    for (let i = 1; i < waypoints.length; i++) {
        const target = turf.point([waypoints[i].lng, waypoints[i].lat]);
        let bestIdx = lastIndex;
        let minD = Infinity;

        for (let j = lastIndex; j < routePath.length; j++) {
            const d = turf.distance(target, turf.point(routePath[j]));
            if (d < minD) {
                minD = d;
                bestIdx = j;
            }
        }

        const segmentCoords = routePath.slice(lastIndex, bestIdx + 1);
        if (segmentCoords.length > 1) {
            runningDist += turf.length(turf.lineString(segmentCoords));
        }
        waypointDistances.push(runningDist);
        lastIndex = bestIdx;
    }

    return {
        baseLine,
        totalLen,
        interpolatedPath,
        waypointDistances,
        totalDuration: (waypoints.length - 1) * SEGMENT_DURATION_MS,
        segmentDuration: SEGMENT_DURATION_MS,
    };
}
