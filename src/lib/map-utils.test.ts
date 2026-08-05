import { describe, expect, it } from 'vitest';
import { fixDatelineCrossing, getFlagEmoji, routeCacheKey } from './map-utils';
import type { Waypoint } from './store';

const wp = (over: Partial<Waypoint> = {}): Waypoint => ({
    id: 'a',
    name: 'Seoul',
    lat: 37.5665,
    lng: 126.978,
    transport: 'plane',
    emoji: '🇰🇷',
    ...over,
});

describe('fixDatelineCrossing', () => {
    it('leaves a path that never crosses the antimeridian alone', () => {
        const coords = [[0, 0], [10, 5], [20, 10]];
        expect(fixDatelineCrossing(coords)).toEqual([[0, 0], [10, 5], [20, 10]]);
    });

    it('unwraps eastward across the antimeridian instead of jumping back', () => {
        // Seoul-ish heading east past the dateline. Naively this reads as a
        // 358° jump westward across the entire map.
        const coords = [[179, 0], [-179, 0]];
        expect(fixDatelineCrossing(coords)).toEqual([[179, 0], [181, 0]]);
    });

    it('unwraps westward across the antimeridian', () => {
        const coords = [[-179, 0], [179, 0]];
        expect(fixDatelineCrossing(coords)).toEqual([[-179, 0], [-181, 0]]);
    });

    it('keeps accumulating when travel continues in one direction', () => {
        // Heading steadily east past the dateline and onwards.
        const coords = [[170, 0], [-170, 0], [-150, 0]];
        expect(fixDatelineCrossing(coords)).toEqual([
            [170, 0],
            [190, 0],
            [210, 0],
        ]);
    });

    it('winds back when the route doubles back over the dateline', () => {
        // East 20°, west 20°, east 20° — not three eastward crossings.
        const coords = [[170, 0], [-170, 0], [170, 0], [-170, 0]];
        expect(fixDatelineCrossing(coords)).toEqual([
            [170, 0],
            [190, 0],
            [170, 0],
            [190, 0],
        ]);
    });

    it('never leaves a gap wider than 180 degrees between neighbours', () => {
        const coords = [[0, 0], [179, 10], [-179, 20], [-100, 30], [100, 40]];
        const fixed = fixDatelineCrossing(coords);

        for (let i = 1; i < fixed.length; i++) {
            expect(Math.abs(fixed[i][0] - fixed[i - 1][0])).toBeLessThanOrEqual(180);
        }
    });

    it('preserves latitude and any extra ordinates', () => {
        const coords = [[179, 37.5, 100], [-179, 35.6, 200]];
        const fixed = fixDatelineCrossing(coords);

        expect(fixed[0]).toEqual([179, 37.5, 100]);
        expect(fixed[1]).toEqual([181, 35.6, 200]);
    });

    it('does not mutate its input', () => {
        const coords = [[179, 0], [-179, 0]];
        const snapshot = structuredClone(coords);

        fixDatelineCrossing(coords);

        expect(coords).toEqual(snapshot);
    });

    it('handles empty and single-point paths', () => {
        expect(fixDatelineCrossing([])).toEqual([]);
        expect(fixDatelineCrossing([[42, 7]])).toEqual([[42, 7]]);
    });
});

describe('routeCacheKey', () => {
    it('ignores fields that cannot move the line', () => {
        const before = [wp(), wp({ id: 'b', name: 'Tokyo', lat: 35.6762, lng: 139.6503 })];
        const renamed = [
            wp({ id: 'x', name: 'Seoul Incheon', emoji: '🛫' }),
            wp({ id: 'y', name: 'Tokyo Haneda', lat: 35.6762, lng: 139.6503, emoji: '🗼' }),
        ];

        expect(routeCacheKey(renamed)).toBe(routeCacheKey(before));
    });

    it('changes when a coordinate moves', () => {
        const a = [wp(), wp({ lat: 35.6762, lng: 139.6503 })];
        const b = [wp(), wp({ lat: 35.6762, lng: 139.7 })];

        expect(routeCacheKey(b)).not.toBe(routeCacheKey(a));
    });

    it('changes when a transport mode changes, because the geometry differs', () => {
        const flying = [wp(), wp({ transport: 'plane' })];
        const driving = [wp(), wp({ transport: 'car' })];

        expect(routeCacheKey(driving)).not.toBe(routeCacheKey(flying));
    });

    it('changes when stops are reordered', () => {
        const a = wp({ id: '1', lat: 10, lng: 10 });
        const b = wp({ id: '2', lat: 20, lng: 20 });

        expect(routeCacheKey([a, b])).not.toBe(routeCacheKey([b, a]));
    });

    it('changes when a stop is added or removed', () => {
        const two = [wp(), wp({ lat: 1, lng: 1 })];
        const three = [...two, wp({ lat: 2, lng: 2 })];

        expect(routeCacheKey(three)).not.toBe(routeCacheKey(two));
        expect(routeCacheKey([])).toBe('');
    });
});

describe('getFlagEmoji', () => {
    it('maps a country code to its regional indicator pair', () => {
        expect(getFlagEmoji('KR')).toBe('🇰🇷');
        expect(getFlagEmoji('JP')).toBe('🇯🇵');
        expect(getFlagEmoji('FR')).toBe('🇫🇷');
    });

    it('accepts lowercase codes, which is what the geocoder returns', () => {
        expect(getFlagEmoji('kr')).toBe('🇰🇷');
        expect(getFlagEmoji('us')).toBe('🇺🇸');
    });
});
