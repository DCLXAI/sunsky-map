import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOwnerId } from '@/lib/owner-server';

// Every response here is scoped to the caller's bearer cookie. `private,
// no-store` keeps that invisible to shared caches — route every return
// through this instead of calling NextResponse.json directly, so the header
// can never be forgotten at a call site.
function json(body: unknown, init?: ResponseInit) {
    const response = NextResponse.json(body, init);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
}

export async function GET() {
    const ownerId = await getOwnerId();
    if (!ownerId) return json({ error: 'Missing owner' }, { status: 401 });

    try {
        const projects = await prisma.project.findMany({
            where: { ownerId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, title: true, updatedAt: true }
        });
        return json(projects);
    } catch (error) {
        console.error('API Error in GET /projects:', error);
        return json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

export async function POST() {
    const ownerId = await getOwnerId();
    if (!ownerId) return json({ error: 'Missing owner' }, { status: 401 });

    try {
        const project = await prisma.project.create({
            data: {
                ownerId,
                title: 'New Trip',
                waypoints: {
                    create: [
                        { order: 0, name: 'Seoul', lat: 37.5665, lng: 126.9780, transport: 'plane', emoji: '🇰🇷' },
                        { order: 1, name: 'Tokyo', lat: 35.6762, lng: 139.6503, transport: 'plane', emoji: '🇯🇵' }
                    ]
                }
            },
            // Never serialise ownerId back to the client — it is a bearer
            // credential kept in an httpOnly cookie for a reason.
            select: { id: true, title: true, updatedAt: true }
        });
        return json(project);
    } catch (error) {
        console.error('API Error in POST /projects:', error);
        return json({ error: 'Creation failed' }, { status: 500 });
    }
}
