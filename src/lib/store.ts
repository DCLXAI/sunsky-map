import { create } from 'zustand';

export type TransportMode = 'plane' | 'car' | 'train' | 'walk';

export interface Waypoint {
    id: string;
    name: string;
    lat: number;
    lng: number;
    transport: TransportMode;
    emoji: string;
}

interface EditorState {
    // Waypoints
    waypoints: Waypoint[];
    addWaypoint: (wp: Waypoint) => void;
    removeWaypoint: (id: string) => void;
    updateWaypoint: (id: string, data: Partial<Waypoint>) => void;
    reorderWaypoints: (waypoints: Waypoint[]) => void;
    setWaypoints: (waypoints: Waypoint[]) => void;

    // Project Info
    projectTitle: string;
    setProjectTitle: (title: string) => void;

    // Map Settings
    mapStyle: string;
    setMapStyle: (style: string) => void;

    // Camera Settings
    cameraView: 'follow' | 'top' | 'side' | 'global';
    setCameraView: (view: 'follow' | 'top' | 'side' | 'global') => void;

    // Playback
    isPlaying: boolean;
    setPlaying: (playing: boolean) => void;

    // Export
    isExporting: boolean;
    setExporting: (exporting: boolean) => void;

    // Language
    language: 'en' | 'ko';
    setLanguage: (lang: 'en' | 'ko') => void;
}

const getRandomEmoji = () => {
    const list = ['📍', '📸', '🍕', '🏨', '🏖️', '⛰️', '🏰', '✈️', '🍜', '🗽'];
    return list[Math.floor(Math.random() * list.length)];
};

export const useEditorStore = create<EditorState>((set) => ({
    waypoints: [
        { id: 'wp-1', name: 'Seoul', lat: 37.5665, lng: 126.9780, transport: 'plane', emoji: '🇰🇷' },
        { id: 'wp-2', name: 'Tokyo', lat: 35.6762, lng: 139.6503, transport: 'plane', emoji: '🇯🇵' }
    ],
    addWaypoint: (wp) => set((state) => ({
        waypoints: [...state.waypoints, { ...wp, emoji: wp.emoji || getRandomEmoji() }]
    })),
    removeWaypoint: (id) => set((state) => ({ waypoints: state.waypoints.filter((w) => w.id !== id) })),
    updateWaypoint: (id, data) => set((state) => ({
        waypoints: state.waypoints.map((w) => (w.id === id ? { ...w, ...data } : w)),
    })),
    reorderWaypoints: (waypoints) => set({ waypoints }),
    setWaypoints: (waypoints) => set({ waypoints }),

    projectTitle: "New Trip",
    setProjectTitle: (projectTitle) => set({ projectTitle }),

    mapStyle: "mapbox://styles/mapbox/satellite-streets-v12",
    setMapStyle: (mapStyle) => set({ mapStyle }),

    cameraView: 'follow',
    setCameraView: (cameraView) => set({ cameraView }),

    isPlaying: false,
    setPlaying: (isPlaying) => set({ isPlaying }),

    isExporting: false,
    setExporting: (isExporting) => set({ isExporting }),

    language: 'en',
    setLanguage: (language) => set({ language }),
}));
