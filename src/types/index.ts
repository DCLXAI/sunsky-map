export type TransportMode = 'plane' | 'car' | 'train' | 'walk';

export interface Waypoint {
    id: string;
    name: string;
    lat: number;
    lng: number;
    transport: TransportMode;
}

export interface Project {
    id: string;
    title: string;
    waypoints: Waypoint[];
    createdAt: Date;
    updatedAt: Date;
}
