import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const TRANSPORT_MODES = ['plane', 'car', 'train', 'walk'] as const;
type TransportMode = (typeof TRANSPORT_MODES)[number];

interface ParsedWaypoint {
    name: string;
    lat: number;
    lng: number;
    transport: TransportMode;
    emoji: string | null;
}

/** Returns the sanitised waypoints, or null if the payload is malformed. */
function parseWaypoints(input: unknown): ParsedWaypoint[] | null {
    if (!Array.isArray(input)) return null;

    const parsed: ParsedWaypoint[] = [];
    for (const wp of input) {
        if (typeof wp !== 'object' || wp === null) return null;
        const { name, lat, lng, transport, emoji } = wp as Record<string, unknown>;

        if (typeof name !== 'string') return null;
        if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
        if (typeof lng !== 'number' || !Number.isFinite(lng)) return null;

        parsed.push({
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

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const project = await prisma.project.findUnique({
            where: { id },
            include: { waypoints: { orderBy: { order: 'asc' } } }
        });

        if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(project);
    } catch (error) {
        console.error('API Error in GET /projects/[id]:', error);
        return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
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
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const title = typeof body.title === 'string' && body.title.trim() ? body.title : 'My Journey';
    const waypoints = parseWaypoints(body.waypoints);

    if (!waypoints) {
        return NextResponse.json({ error: 'Invalid waypoints payload' }, { status: 400 });
    }

    try {
        await prisma.$transaction([
            prisma.waypoint.deleteMany({ where: { projectId: id } }),
            prisma.project.update({
                where: { id },
                data: {
                    title,
                    waypoints: {
                        create: waypoints.map((wp, index) => ({ ...wp, order: index }))
                    }
                }
            })
        ]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API Error in PUT /projects/[id]:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await prisma.project.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API Error in DELETE /projects/[id]:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
