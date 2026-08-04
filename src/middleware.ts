import { NextResponse, type NextRequest } from 'next/server';
import { OWNER_COOKIE, OWNER_HEADER, createOwnerId } from '@/lib/owner';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function middleware(request: NextRequest) {
    const existing = request.cookies.get(OWNER_COOKIE)?.value;
    const ownerId = existing ?? createOwnerId();

    // `set`, never `append`: this overwrites any x-sunsky-owner header the
    // client tried to forge, so the cookie is the only source of identity.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(OWNER_HEADER, ownerId);

    const response = NextResponse.next({ request: { headers: requestHeaders } });

    if (!existing) {
        response.cookies.set(OWNER_COOKIE, ownerId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: ONE_YEAR_SECONDS,
        });
    }

    return response;
}

export const config = {
    // Pages and API routes only — no cookie churn on chunks and images.
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
