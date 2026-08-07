/**
 * Caps on anything a stranger can make this app spend or store.
 *
 * The site has no login, so every limit here is best-effort against a
 * determined attacker: clearing the `sunsky_owner` cookie yields a fresh
 * per-visitor budget. The global cap is the one that actually bounds the bill,
 * and it is deliberately the last line rather than the first.
 */

/** Reads a positive integer from the environment, falling back when unset or junk. */
function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const LIMITS = {
    /** AI generations one visitor may make per hour. */
    get aiPerOwnerHourly() {
        return envInt('AI_LIMIT_PER_OWNER_HOURLY', 10);
    },
    /** AI generations the whole site may make per day — the actual spend ceiling. */
    get aiGlobalDaily() {
        return envInt('AI_LIMIT_GLOBAL_DAILY', 500);
    },
    /** Longest prompt accepted by the AI route. A trip description is a sentence
     *  or two; anything longer is either abuse or a mistake, and prompt length
     *  drives token cost directly. */
    promptMaxChars: 500,
    /** Most stops one project may hold. */
    waypointsPerProject: 60,
    /** Most projects one visitor may create. */
    projectsPerOwner: 50,
} as const;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export interface RateDecision {
    allowed: boolean;
    /** Which ceiling was hit, for the log and the response. */
    scope?: 'owner' | 'global';
    /** Seconds the caller should wait, for the Retry-After header. */
    retryAfterSeconds?: number;
}

/**
 * Decides whether one more AI generation is allowed.
 *
 * Pure, so the thresholds and the precedence between them can be tested
 * without a database or a clock.
 */
export function decideAiRateLimit(counts: {
    ownerLastHour: number;
    globalLastDay: number;
    ownerHourlyLimit: number;
    globalDailyLimit: number;
}): RateDecision {
    // Global first: when the site as a whole is out of budget, telling one
    // visitor they personally have requests left would be a lie.
    if (counts.globalLastDay >= counts.globalDailyLimit) {
        return { allowed: false, scope: 'global', retryAfterSeconds: 3600 };
    }
    if (counts.ownerLastHour >= counts.ownerHourlyLimit) {
        return { allowed: false, scope: 'owner', retryAfterSeconds: 900 };
    }
    return { allowed: true };
}
