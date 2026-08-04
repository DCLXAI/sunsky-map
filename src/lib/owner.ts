/** Shared between the edge middleware and the Node route handlers, so this
 *  module must not import anything from Next. */

export const OWNER_COOKIE = 'sunsky_owner';
export const OWNER_HEADER = 'x-sunsky-owner';

/** 256 bits of randomness, hex encoded. The id is the bearer token — it is
 *  never signed, because guessing it is already infeasible. */
export function createOwnerId(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
