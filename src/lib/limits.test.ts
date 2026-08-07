import { afterEach, describe, expect, it } from 'vitest';
import { LIMITS, decideAiRateLimit } from './limits';

const base = { ownerHourlyLimit: 10, globalDailyLimit: 500 };

describe('decideAiRateLimit', () => {
    it('allows a request while both budgets have room', () => {
        expect(decideAiRateLimit({ ...base, ownerLastHour: 0, globalLastDay: 0 }))
            .toEqual({ allowed: true });
        expect(decideAiRateLimit({ ...base, ownerLastHour: 9, globalLastDay: 499 }))
            .toEqual({ allowed: true });
    });

    it('blocks the request that would exceed the per-visitor limit, not the one that reaches it', () => {
        // 10 already made against a limit of 10 means the budget is spent.
        const atLimit = decideAiRateLimit({ ...base, ownerLastHour: 10, globalLastDay: 0 });
        expect(atLimit.allowed).toBe(false);
        expect(atLimit.scope).toBe('owner');
    });

    it('blocks on the global ceiling', () => {
        const decision = decideAiRateLimit({ ...base, ownerLastHour: 0, globalLastDay: 500 });
        expect(decision.allowed).toBe(false);
        expect(decision.scope).toBe('global');
    });

    it('reports the global ceiling first when both are exhausted', () => {
        // Telling one visitor they have personal quota left would be a lie when
        // the site as a whole is out of budget.
        const decision = decideAiRateLimit({ ...base, ownerLastHour: 99, globalLastDay: 999 });
        expect(decision.scope).toBe('global');
    });

    it('always supplies a retry hint when it refuses', () => {
        for (const counts of [
            { ...base, ownerLastHour: 10, globalLastDay: 0 },
            { ...base, ownerLastHour: 0, globalLastDay: 500 },
        ]) {
            const decision = decideAiRateLimit(counts);
            expect(decision.allowed).toBe(false);
            expect(decision.retryAfterSeconds).toBeGreaterThan(0);
        }
    });

    it('honours limits of zero, which disable the feature outright', () => {
        expect(decideAiRateLimit({ ...base, ownerHourlyLimit: 0, ownerLastHour: 0, globalLastDay: 0 }).allowed)
            .toBe(false);
        expect(decideAiRateLimit({ ...base, globalDailyLimit: 0, ownerLastHour: 0, globalLastDay: 0 }).scope)
            .toBe('global');
    });
});

describe('LIMITS', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it('falls back to the defaults when the environment says nothing', () => {
        delete process.env.AI_LIMIT_PER_OWNER_HOURLY;
        delete process.env.AI_LIMIT_GLOBAL_DAILY;
        expect(LIMITS.aiPerOwnerHourly).toBe(10);
        expect(LIMITS.aiGlobalDaily).toBe(500);
    });

    it('takes overrides from the environment', () => {
        process.env.AI_LIMIT_PER_OWNER_HOURLY = '3';
        process.env.AI_LIMIT_GLOBAL_DAILY = '25';
        expect(LIMITS.aiPerOwnerHourly).toBe(3);
        expect(LIMITS.aiGlobalDaily).toBe(25);
    });

    it('ignores junk and negative overrides rather than disabling the cap', () => {
        // A typo in an env var must not silently remove the spend ceiling.
        for (const junk of ['abc', '-5', '0', '', ' ']) {
            process.env.AI_LIMIT_GLOBAL_DAILY = junk;
            expect(LIMITS.aiGlobalDaily).toBe(500);
        }
    });

    it('keeps the storage caps positive and sane', () => {
        expect(LIMITS.promptMaxChars).toBeGreaterThan(0);
        expect(LIMITS.waypointsPerProject).toBeGreaterThan(1);
        expect(LIMITS.projectsPerOwner).toBeGreaterThan(0);
    });
});
