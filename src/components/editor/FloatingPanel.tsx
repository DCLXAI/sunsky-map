"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useEditorStore, type TransportMode, type Waypoint } from '@/lib/store';
import { getFlagEmoji } from '@/lib/map-utils';
import { useTranslation } from '@/lib/i18n';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Trash2, Plane, Car, Train, Footprints, Search, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface GeocodingFeature {
    id: string;
    place_name: string;
    center: [number, number];
    context?: { id: string, short_code?: string }[];
}

interface GeneratedWaypoint {
    name: string;
    lat: number;
    lng: number;
    transport?: TransportMode;
    emoji?: string;
}

import { toast } from "sonner";

export default function FloatingPanel() {
    const { waypoints, updateWaypoint, removeWaypoint, reorderWaypoints, projectTitle, setProjectTitle, addWaypoint, setWaypoints, mapStyle, setMapStyle, cameraView, setCameraView } = useEditorStore();
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<GeocodingFeature[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);

    // AI Generation State
    const [showAi, setShowAi] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleAiGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        const toastId = toast.loading("Generating route with Gemini...");

        try {
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: aiPrompt })
            });
            const data = await res.json();

            if (data.waypoints) {
                const newWaypoints: Waypoint[] = data.waypoints.map((wp: GeneratedWaypoint) => ({
                    id: crypto.randomUUID(),
                    name: wp.name,
                    lat: wp.lat,
                    lng: wp.lng,
                    transport: wp.transport || 'plane',
                    emoji: wp.emoji || '📍'
                }));
                // Replace existing waypoints with AI generated ones
                setWaypoints(newWaypoints);
                setShowAi(false);
                setAiPrompt('');
                // Default to 'follow' view for new route
                setCameraView('follow');
                toast.success("Route generated successfully!", { id: toastId });
            } else {
                // Show specific error from backend if available
                toast.error(data.error || "Failed to generate route. Please try again.", {
                    id: toastId,
                    duration: 5000 // Show for longer so user can read
                });
            }
        } catch (e) {
            console.error(e);
            toast.error("Error generating route", { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    const performSearch = useCallback(async (query: string) => {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
            console.warn("NEXT_PUBLIC_MAPBOX_TOKEN is not set — city search is disabled.");
            return;
        }

        setIsSearching(true);
        try {
            const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&types=place,locality&limit=5`);
            const data: { features?: GeocodingFeature[] } = await res.json();
            if (data.features) {
                setSearchResults(data.features);
                setShowResults(true);
            }
        } catch (e) {
            console.error("Geocoding error:", e);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Debounced Search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.length > 2) {
                performSearch(searchQuery);
            } else {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, performSearch]);

    const handleSelectCity = (feature: GeocodingFeature) => {
        addWaypoint({
            id: crypto.randomUUID(),
            name: feature.place_name.split(',')[0], // Use just city name
            lat: feature.center[1],
            lng: feature.center[0],
            transport: 'plane',
            emoji: getFeatureFlag(feature)
        });
        setSearchQuery('');
        setSearchResults([]);
        setShowResults(false);
    };

    const getFeatureFlag = (feature: GeocodingFeature) => {
        const countryContext = feature.context?.find(c => c.id.startsWith('country'));
        if (countryContext?.short_code) {
            return getFlagEmoji(countryContext.short_code);
        }
        return '🌍';
    };

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const items = Array.from(waypoints);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        reorderWaypoints(items);
    };

    return (
        <div className="absolute top-4 left-4 w-96 max-h-[calc(100vh-2rem)] flex flex-col gap-4 z-20">

            {/* 1. Project Title */}
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-white/20">
                <Link href="/" className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100 cursor-pointer hover:opacity-75 transition-opacity">
                    <span className="text-2xl">🌥️</span>
                    <span className="font-black text-lg bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                        Sunsky.ai
                    </span>
                </Link>
                <div className="group relative">
                    <input
                        placeholder="Trip Title..."
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        className="w-full text-lg font-bold bg-transparent outline-none border-b border-transparent focus:border-blue-500 transition-all text-gray-800 placeholder-gray-400 pb-1"
                    />
                </div>
            </div>

            {/* AI Assistant Toggle */}
            {/* AI Assistant Toggle */}
            <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 transition-all">
                <button
                    onClick={() => setShowAi(!showAi)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-blue-50/50 transition-colors rounded-2xl"
                >
                    <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600 flex items-center gap-2">
                        <Sparkles size={18} className="text-purple-500" />
                        AI Route Assistant
                    </span>
                    {showAi ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </button>

                {showAi && (
                    <div className="p-4 pt-0 space-y-3">
                        <textarea
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAiGenerate();
                                }
                            }}
                            placeholder="e.g. I want to travel from Seoul to Tokyo, then fly to Paris and finish in New York. (Press Enter)"
                            className="w-full text-sm p-3 bg-gray-50 rounded-xl border border-gray-100 focus:border-purple-300 focus:ring-2 ring-purple-100 outline-none resize-none h-24 placeholder-gray-400 text-gray-700"
                            autoFocus
                        />
                        <button
                            onClick={handleAiGenerate}
                            disabled={isGenerating || !aiPrompt.trim()}
                            className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                            {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                            {isGenerating ? 'Generating Magic...' : 'Generate Route'}
                        </button>
                    </div>
                )}
            </div>

            {/* 2. Add Stop (City Search) */}
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-white/20 relative z-50">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t("Add Place")}</h2>
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-blue-500 transition-colors" size={18} />
                    <input
                        placeholder={t("Search cities...")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                        className="w-full pl-10 pr-4 py-3 bg-gray-100/50 hover:bg-white focus:bg-white rounded-xl outline-none border border-transparent focus:border-blue-500 transition-all font-medium text-gray-700 placeholder-gray-400"
                    />
                    {isSearching && <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />}
                </div>

                {/* Search Results Dropdown */}
                {showResults && searchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                        {searchResults.map((feature) => (
                            <button
                                key={feature.id}
                                onClick={() => handleSelectCity(feature)}
                                className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-2 border-b border-gray-50 last:border-0 transition-colors"
                            >
                                <span className="text-lg shadow-sm">{getFeatureFlag(feature)}</span>
                                <span className="font-medium text-gray-700 text-sm truncate">{feature.place_name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Suggested Cities Chips */}
                {!showResults && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {[
                            { name: 'Seoul', flag: '🇰🇷', lat: 37.5665, lng: 126.9780 },
                            { name: 'Tokyo', flag: '🇯🇵', lat: 35.6762, lng: 139.6503 },
                            { name: 'New York', flag: '🇺🇸', lat: 40.7128, lng: -74.0060 },
                            { name: 'Paris', flag: '🇫🇷', lat: 48.8566, lng: 2.3522 },
                            { name: 'London', flag: '🇬🇧', lat: 51.5074, lng: -0.1278 },
                            { name: 'Bangkok', flag: '🇹🇭', lat: 13.7563, lng: 100.5018 }
                        ].map(city => (
                            <button
                                key={city.name}
                                onClick={() => addWaypoint({
                                    id: crypto.randomUUID(),
                                    name: city.name, lat: city.lat, lng: city.lng, transport: 'plane',
                                    emoji: city.flag
                                })}
                                className="px-3 py-1.5 bg-white/50 hover:bg-white border border-white/20 hover:border-blue-300 rounded-lg text-xs font-semibold text-gray-600 hover:text-blue-600 transition-all shadow-sm backdrop-blur-sm flex items-center gap-1.5"
                            >
                                <span>{city.flag}</span>
                                {city.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 3. Map Style Selector */}
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-white/20">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t("Map Style")}</h2>
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { id: 'satellite', name: 'Sat', style: 'mapbox://styles/mapbox/satellite-streets-v12', icon: '🛰️' },
                        { id: 'streets', name: 'Map', style: 'mapbox://styles/mapbox/streets-v12', icon: '🗺️' },
                        { id: 'dark', name: 'Dark', style: 'mapbox://styles/mapbox/dark-v11', icon: '🌑' },
                        { id: 'light', name: 'Light', style: 'mapbox://styles/mapbox/light-v11', icon: '☀️' }
                    ].map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setMapStyle(s.style)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${mapStyle === s.style
                                ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-inner'
                                : 'bg-transparent border-transparent hover:bg-gray-100 text-gray-500'
                                }`}
                        >
                            <span className="text-xl">{s.icon}</span>
                            <span className="text-[10px] font-bold">{t(s.name)}</span>
                        </button>
                    ))}
                </div>

                {/* Camera Selector */}
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4">{t("Camera View")}</h2>
                <div className="grid grid-cols-4 gap-2">
                    {([
                        { id: 'follow', name: 'Chase', icon: '🎥' }, // follow
                        { id: 'top', name: 'Top', icon: '⬇️' }, // top-down
                        { id: 'side', name: 'Side', icon: '🚁' }, // side
                        { id: 'global', name: 'World', icon: '🌍' } // global
                    ] as const).map((c) => (
                        <button
                            key={c.id}
                            onClick={() => setCameraView(c.id)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${cameraView === c.id
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-600 shadow-inner'
                                : 'bg-transparent border-transparent hover:bg-gray-100 text-gray-500'
                                }`}
                        >
                            <span className="text-xl">{c.icon}</span>
                            <span className="text-[10px] font-bold">{t(c.name)}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 4. Waypoint List */}
            <div className="flex-1 overflow-y-auto rounded-2xl bg-white/80 backdrop-blur-md shadow-2xl border border-white/20 p-2 custom-scrollbar">
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="waypoints">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                {waypoints.map((wp, index) => (
                                    <Draggable key={wp.id} draggableId={wp.id} index={index}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                className={`bg-white/90 p-3 rounded-xl border transition-all duration-200 ${snapshot.isDragging ? 'shadow-xl scale-105 border-blue-400 z-50' : 'shadow-sm hover:border-blue-200 border-white/50'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div {...provided.dragHandleProps} className="text-gray-300 cursor-grab hover:text-gray-500">
                                                        <GripVertical size={16} />
                                                    </div>

                                                    {/* Emoji Input */}
                                                    <div className="relative group">
                                                        <input
                                                            className="w-10 h-10 text-2xl text-center border rounded-lg bg-gray-50 cursor-pointer hover:bg-white focus:ring-2 ring-blue-200 outline-none transition-all"
                                                            value={wp.emoji}
                                                            onChange={(e) => updateWaypoint(wp.id, { emoji: e.target.value })}
                                                            placeholder="📍"
                                                            maxLength={2}
                                                        />
                                                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-black text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                                            Change Emoji
                                                        </span>
                                                    </div>

                                                    <input
                                                        value={wp.name}
                                                        onChange={(e) => updateWaypoint(wp.id, { name: e.target.value })}
                                                        className="font-bold text-gray-700 w-full outline-none bg-transparent text-sm ml-1 border-b border-transparent focus:border-blue-200 px-1"
                                                        placeholder="City Name"
                                                    />
                                                    <button onClick={() => removeWaypoint(wp.id)} className="text-gray-300 hover:text-red-500 p-1 rounded-md transition-colors">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                <div className="flex gap-1 pl-10">
                                                    {(['plane', 'car', 'train', 'walk'] as const).map((mode) => (
                                                        <button
                                                            key={mode}
                                                            onClick={() => updateWaypoint(wp.id, { transport: mode })}
                                                            className={`p-1.5 rounded-lg transition-all text-[10px] font-medium flex items-center gap-1 ${wp.transport === mode
                                                                ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                                                                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                                                }`}
                                                        >
                                                            {mode === 'plane' && <Plane size={10} />}
                                                            {mode === 'car' && <Car size={10} />}
                                                            {mode === 'train' && <Train size={10} />}
                                                            {mode === 'walk' && <Footprints size={10} />}
                                                            <span className="capitalize">{mode}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>

                {waypoints.length === 0 && (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        Start your journey by<br />searching for a city above.
                    </div>
                )}
            </div>
        </div>
    );
}
