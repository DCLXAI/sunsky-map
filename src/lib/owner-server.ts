import { headers } from 'next/headers';
import { OWNER_HEADER } from './owner';

/** The middleware republishes the owner id as a request header, so handlers
 *  read one place whether or not the cookie existed on this request. */
export async function getOwnerId(): Promise<string | null> {
    const requestHeaders = await headers();
    return requestHeaders.get(OWNER_HEADER);
}
