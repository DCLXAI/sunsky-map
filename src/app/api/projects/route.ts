import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOwnerId } from '@/lib/owner-server';

export async function GET() {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: 'Missing owner' }, { status: 401 });

    try {
        const projects = await prisma.project.findMany({
            where: { ownerId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, title: true, updatedAt: true }
        });
        return NextResponse.json(projects);
    } catch (error) {
        console.error('API Error in GET /projects:', error);
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

export async function POST() {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: 'Missing owner' }, { status: 401 });

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
            }
        });
        return NextResponse.json(project);
    } catch (error) {
        console.error('API Error in POST /projects:', error);
        return NextResponse.json({ error: 'Creation failed' }, { status: 500 });
    }
}
