import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const project = await prisma.project.findUnique({
        where: { id },
        include: { waypoints: { orderBy: { order: 'asc' } } }
    });

    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(project);
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { title, waypoints } = body;

    try {
        await prisma.$transaction([
            prisma.waypoint.deleteMany({ where: { projectId: id } }),
            prisma.project.update({
                where: { id },
                data: {
                    title,
                    waypoints: {
                        create: waypoints.map((wp: any, index: number) => ({
                            name: wp.name,
                            lat: wp.lat,
                            lng: wp.lng,
                            transport: wp.transport,
                            emoji: wp.emoji,
                            order: index
                        }))
                    }
                }
            })
        ]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("API Error in PUT /projects/[id]:", error);
        return NextResponse.json({ error: 'Update failed', details: String(error) }, { status: 500 });
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
        console.error("API Error in DELETE /projects/[id]:", error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
