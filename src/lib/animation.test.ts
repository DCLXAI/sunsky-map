import { describe, expect, it } from 'vitest';
import { buildPathData, SEGMENT_DURATION_MS } from './animation';
import type { Waypoint } from './store';

const wp = (name: string, lat: number, lng: number): Waypoint => ({
    id: name,
    name,
    lat,
    lng,
    transport: 'plane',
    emoji: '📍',
});

const SEOUL = wp('Seoul', 37.5665, 126.978);
const TOKYO = wp('Tokyo', 35.6762, 139.6503);
const PARIS = wp('Paris', 48.8566, 2.3522);

/** A straight two-point path between two waypoints. */
const directPath = (a: Waypoint, b: Waypoint) => [
    [a.lng, a.lat],
    [b.lng, b.lat],
];

describe('buildPathData', () => {
    it('returns null when there is nothing to animate', () => {
        expect(buildPathData([], [])).toBeNull();
        expect(buildPathData([[126.978, 37.5665]], [SEOUL])).toBeNull();
    });

    it('returns null for a degenerate route with no length', () => {
        const samePoint = [
            [126.978, 37.5665],
            [126.978, 37.5665],
        ];
        expect(buildPathData(samePoint, [SEOUL, SEOUL])).toBeNull();
    });

    it('measures the route and interpolates along it', () => {
        const data = buildPathData(directPath(SEOUL, TOKYO), [SEOUL, TOKYO]);
        expect(data).not.toBeNull();

        // Seoul to Tokyo is roughly 1150 km.
        expect(data!.totalLen).toBeGreaterThan(1000);
        expect(data!.totalLen).toBeLessThan(1300);

        // Vertices are ~5 km apart, so a 1150 km route yields a few hundred.
        expect(data!.interpolatedPath.length).toBeGreaterThan(200);
        expect(data!.interpolatedPath.length).toBeLessThan(300);
    });

    it('starts the interpolated path at the origin and ends it at the destination', () => {
        const data = buildPathData(directPath(SEOUL, TOKYO), [SEOUL, TOKYO])!;
        const first = data.interpolatedPath[0];
        const last = data.interpolatedPath[data.interpolatedPath.length - 1];

        expect(first[0]).toBeCloseTo(SEOUL.lng, 3);
        expect(first[1]).toBeCloseTo(SEOUL.lat, 3);
        expect(last[0]).toBeCloseTo(TOKYO.lng, 3);
        expect(last[1]).toBeCloseTo(TOKYO.lat, 3);
    });

    it('gives one cumulative distance per waypoint, starting at zero and non-decreasing', () => {
        const path = [
            [SEOUL.lng, SEOUL.lat],
            [TOKYO.lng, TOKYO.lat],
            [PARIS.lng, PARIS.lat],
        ];
        const data = buildPathData(path, [SEOUL, TOKYO, PARIS])!;

        expect(data.waypointDistances).toHaveLength(3);
        expect(data.waypointDistances[0]).toBe(0);

        for (let i = 1; i < data.waypointDistances.length; i++) {
            expect(data.waypointDistances[i]).toBeGreaterThanOrEqual(
                data.waypointDistances[i - 1]
            );
        }
    });

    it('places the final waypoint at the full route length', () => {
        const data = buildPathData(directPath(SEOUL, TOKYO), [SEOUL, TOKYO])!;
        const last = data.waypointDistances[data.waypointDistances.length - 1];

        expect(last).toBeCloseTo(data.totalLen, 5);
    });

    it('budgets one segment of time per leg, so the timeline covers every leg', () => {
        const twoStops = buildPathData(directPath(SEOUL, TOKYO), [SEOUL, TOKYO])!;
        expect(twoStops.segmentDuration).toBe(SEGMENT_DURATION_MS);
        expect(twoStops.totalDuration).toBe(SEGMENT_DURATION_MS);

        const path = [
            [SEOUL.lng, SEOUL.lat],
            [TOKYO.lng, TOKYO.lat],
            [PARIS.lng, PARIS.lat],
        ];
        const threeStops = buildPathData(path, [SEOUL, TOKYO, PARIS])!;
        expect(threeStops.totalDuration).toBe(2 * SEGMENT_DURATION_MS);

        // The loop indexes waypointDistances[seg] and [seg + 1], so there must
        // be exactly one more distance entry than there are segments.
        const segments = threeStops.totalDuration / threeStops.segmentDuration;
        expect(threeStops.waypointDistances.length).toBe(segments + 1);
    });

    it('does not mutate the route it is given', () => {
        const path = directPath(SEOUL, TOKYO);
        const snapshot = structuredClone(path);

        buildPathData(path, [SEOUL, TOKYO]);

        expect(path).toEqual(snapshot);
    });
});
