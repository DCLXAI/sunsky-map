import { describe, expect, it } from 'vitest';
import { fixDatelineCrossing, getFlagEmoji } from './map-utils';

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
