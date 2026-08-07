import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOwnerId } from '@/lib/owner-server';
import { LIMITS } from '@/lib/limits';

// Every response here is scoped to the caller's bearer cookie. `private,
// no-store` keeps that invisible to shared caches — route every return
// through this instead of calling NextResponse.json directly, so the header
// can never be forgotten at a call site.
function json(body: unknown, init?: ResponseInit) {
    const response = NextResponse.json(body, init);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
}

const TRANSPORT_MODES = ['plane', 'car', 'train', 'walk'] as const;
type TransportMode = (typeof TRANSPORT_MODES)[number];

interface ParsedWaypoint {
    /** The client's idea of this stop's identity. Only honoured when it names
     *  a waypoint already belonging to this project. */
    id: string | null;
    name: string;
    lat: number;
    lng: number;
    transport: TransportMode;
    emoji: string | null;
}

/** Returns the sanitised waypoints, or null if the payload is malformed. */
function parseWaypoints(input: unknown): ParsedWaypoint[] | null {
    if (!Array.isArray(input)) return null;
    if (input.length > LIMITS.waypointsPerProject) return null;

    const parsed: ParsedWaypoint[] = [];
    for (const wp of input) {
        if (typeof wp !== 'object' || wp === null) return null;
        const { id, name, lat, lng, transport, emoji } = wp as Record<string, unknown>;

        if (typeof name !== 'string') return null;
        if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
        if (typeof lng !== 'number' || !Number.isFinite(lng)) return null;

        parsed.push({
            id: typeof id === 'string' && id ? id : null,
            name,
            lat,
            lng,
            transport: TRANSPORT_MODES.includes(transport as TransportMode)
                ? (transport as TransportMode)
                : 'plane',
            emoji: typeof emoji === 'string' ? emoji : null,
        });
    }
    return parsed;
}

// A factory, not a constant: a Response body is a stream that can only be
// piped once, so a shared instance sends an empty body on its second use and
// throws "ReadableStream is locked" when two denials overlap.
const notFound = () => json({ error: 'Not found' }, { status: 404 });

/** Resolves the caller's owner id, or null when they may not touch this project.
 *  A project owned by someone else is reported as absent, not forbidden. */
async function authorize(id: string): Promise<string | null> {
    const ownerId = await getOwnerId();
    if (!ownerId) return null;

    const project = await prisma.project.findUnique({
        where: { id },
        select: { ownerId: true },
    });

    return project?.ownerId === ownerId ? ownerId : null;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        if (!(await authorize(id))) return notFound();

        const project = await prisma.project.findUnique({
            where: { id },
            // Never serialise ownerId back to the client — it is a bearer
            // credential kept in an httpOnly cookie for a reason.
            select: {
                title: true,
                waypoints: {
                    orderBy: { order: 'asc' },
                    select: { id: true, name: true, lat: true, lng: true, transport: true, emoji: true }
                }
            }
        });

        if (!project) return notFound();
        return json(project);
    } catch (error) {
        console.error('API Error in GET /projects/[id]:', error);
        return json({ error: 'Failed to fetch project' }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    let body: { title?: unknown; waypoints?: unknown };
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const title = typeof body.title === 'string' && body.title.trim() ? body.title : 'My Journey';
    const waypoints = parseWaypoints(body.waypoints);

    if (!waypoints) {
        return json({ error: 'Invalid waypoints payload' }, { status: 400 });
    }

    try {
        if (!(await authorize(id))) return notFound();

        // Reconcile against what is already stored instead of deleting every
        // waypoint and recreating it. Recreating hands out new ids on every
        // save, which would break anything later attached to a stop — a photo,
        // a note, a share link.
        const existing = await prisma.waypoint.findMany({
            where: { projectId: id },
            select: { id: true },
        });
        // Only ids that genuinely belong to this project may be updated; an id
        // from somewhere else is treated as a new stop rather than a write into
        // another project's row.
        const ownIds = new Set(existing.map((wp) => wp.id));

        const seen = new Set<string>();
        const toUpdate: { id: string; data: Omit<ParsedWaypoint, 'id'> & { order: number } }[] = [];
        const toCreate: (Omit<ParsedWaypoint, 'id'> & { order: number; projectId: string })[] = [];

        waypoints.forEach((wp, order) => {
            const { id: clientId, ...fields } = wp;
            // A duplicated id must not update the same row twice.
            if (clientId && ownIds.has(clientId) && !seen.has(clientId)) {
                seen.add(clientId);
                toUpdate.push({ id: clientId, data: { ...fields, order } });
            } else {
                toCreate.push({ ...fields, order, projectId: id });
            }
        });

        const removed = [...ownIds].filter((wpId) => !seen.has(wpId));

        await prisma.$transaction([
            ...(removed.length
                ? [prisma.waypoint.deleteMany({ where: { projectId: id, id: { in: removed } } })]
                : []),
            ...toUpdate.map((wp) =>
                prisma.waypoint.update({ where: { id: wp.id }, data: wp.data })
            ),
            ...(toCreate.length ? [prisma.waypoint.createMany({ data: toCreate })] : []),
            prisma.project.update({ where: { id }, data: { title } }),
        ]);

        return json({ success: true });
    } catch (error) {
        console.error('API Error in PUT /projects/[id]:', error);
        return json({ error: 'Update failed' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const ownerId = await getOwnerId();
        if (!ownerId) return notFound();

        // Scoping the delete to the owner makes the check and the write atomic.
        const { count } = await prisma.project.deleteMany({ where: { id, ownerId } });
        if (count === 0) return notFound();

        return json({ success: true });
    } catch (error) {
        console.error('API Error in DELETE /projects/[id]:', error);
        return json({ error: 'Delete failed' }, { status: 500 });
    }
}
