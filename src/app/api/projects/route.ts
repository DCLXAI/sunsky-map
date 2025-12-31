import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const projects = await prisma.project.findMany({
            orderBy: { updatedAt: 'desc' },
            select: { id: true, title: true, updatedAt: true }
        });
        return NextResponse.json(projects);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

export async function POST() {
    try {
        const project = await prisma.project.create({
            data: {
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
        console.error("Project Creation Error:", error);
        return NextResponse.json({ error: 'Creation failed', details: String(error) }, { status: 500 });
    }
}
