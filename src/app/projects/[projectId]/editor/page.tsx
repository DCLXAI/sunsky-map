"use client";

import React, { useRef, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import FloatingPanel from '@/components/editor/FloatingPanel';
import { useEditorStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { Toaster } from '@/components/ui/toaster';
import { toast } from 'sonner';
import { Play, Download, Loader2, Save, X, Settings2 } from 'lucide-react';
import Link from 'next/link';
import type { MapCanvasHandle } from '@/components/map/MapCanvas';

const MapCanvas = dynamic(() => import('@/components/map/MapCanvas'), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-black flex items-center justify-center text-white font-mono text-sm">INITIALIZING SYSTEM...</div>
});

// ... (existing imports)

export default function EditorPage({ params }: { params: { projectId: string } }) {
    const { projectId } = params;
    const mapRef = useRef<MapCanvasHandle>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { isPlaying, setPlaying, isExporting, setExporting, waypoints, setWaypoints, projectTitle, setProjectTitle, language, setLanguage } = useEditorStore();
    const { t } = useTranslation();

    useEffect(() => {
        // Stop recording when animation finishes
        if (!isPlaying && isExporting && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    }, [isPlaying, isExporting]);

    useEffect(() => {
        fetch(`/api/projects/${projectId}`)
            .then(res => res.json())
            .then(data => {
                if (data.title) setProjectTitle(data.title);
                if (data.waypoints) {
                    setWaypoints(data.waypoints.map((wp: any) => {
                        let emoji = wp.emoji;
                        // Legacy Fix for Seoul/Tokyo
                        if (!emoji || emoji === '📍') {
                            if (wp.name === 'Seoul') emoji = '🇰🇷';
                            if (wp.name === 'Tokyo') emoji = '🇯🇵';
                        }
                        return {
                            id: wp.id || crypto.randomUUID(),
                            name: wp.name,
                            lat: wp.lat, lng: wp.lng, transport: wp.transport,
                            emoji: emoji || '📍'
                        };
                    }));
                }
            });
    }, [projectId]);

    const handleSave = async () => {
        console.log("Saving project...");
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: projectTitle, waypoints })
            });
            if (res.ok) {
                toast.success(t("Project saved successfully!"));
                console.log("Save success");
            } else {
                throw new Error("API Error");
            }
        } catch (e) {
            console.error(e);
            toast.error(t("Failed to save project."));
        } finally {
            setIsSaving(false);
        }
    };

    const getSupportedMimeType = () => {
        const types = [
            'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', // H.264
            'video/mp4',
            'video/webm; codecs=vp9',
            'video/webm; codecs=vp8',
            'video/webm'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    };

    const handleExport = async () => {
        console.log("Export requested. MapRef:", mapRef.current);
        if (!mapRef.current) {
            toast.error(t("Map is not ready yet."));
            return;
        }
        const stream = mapRef.current.captureStream();
        if (!stream) {
            console.error("Capture stream returned null");
            toast.error(t("Failed to capture map stream. Try again."));
            return;
        }

        const mimeType = getSupportedMimeType();
        console.log("Selected MIME Type:", mimeType);

        if (!mimeType) {
            toast.error(t("No supported video format found in this browser."));
            return;
        }

        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            console.log("Recording stopped. Exporting...");
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // Determine extension
            const isMp4 = mimeType.includes('mp4');
            const ext = isMp4 ? 'mp4' : 'webm';
            a.download = `${projectTitle.replace(/\s+/g, '_')}_cinematic.${ext}`;

            a.click();
            setExporting(false);
            setPlaying(false);

            if (isMp4) {
                toast.success(t("Export finished! Downloading MP4..."));
            } else {
                toast.success(t("Export finished! Saved as WebM (MP4 not supported)."));
            }
        };

        recorder.onerror = (e) => {
            console.error("Recorder Error:", e);
            toast.error(t("Recording failed. Please try a different browser."));
        };

        mediaRecorderRef.current = recorder;
        recorder.start(1000); // Record in 1-second chunks to ensure data availability
        setExporting(true);
        toast.info(t("Recording started... Please wait for animation to finish."));
    };

    return (
        <div className="relative h-screen w-full overflow-hidden bg-black font-sans">
            <Toaster />
            {/* ... rest of JSX ... */
            /* 1. Full Screen Map */}
            <div className="absolute inset-0 z-0">
                <MapCanvas mapRef={mapRef} />
            </div>

            {/* 2. Floating UI Layer */}
            <FloatingPanel />

            {/* 3. Top Right Actions */}
            <div className="absolute top-4 right-4 flex gap-3 z-20">
                <button
                    onClick={() => setLanguage(language === 'en' ? 'ko' : 'en')}
                    className="h-10 px-4 bg-white/90 backdrop-blur hover:bg-white rounded-xl shadow-lg border border-white/20 flex items-center gap-2 text-sm font-bold text-gray-700 transition-all hover:scale-105 active:scale-95"
                >
                    <span className="text-lg">{language === 'en' ? '🇰🇷' : '🇺🇸'}</span>
                    <span className="hidden sm:inline">{language === 'en' ? 'KO' : 'EN'}</span>
                </button>

                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-10 px-4 bg-white/90 backdrop-blur hover:bg-white rounded-xl shadow-lg border border-white/20 flex items-center gap-2 text-sm font-bold text-gray-700 transition-all hover:scale-105 active:scale-95"
                >
                    {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    <span className="hidden sm:inline">{t("Save")}</span>
                </button>

                <button
                    onClick={() => setPlaying(!isPlaying)}
                    disabled={isExporting}
                    className="h-10 px-4 bg-white/90 backdrop-blur hover:bg-white rounded-xl shadow-lg border border-white/20 flex items-center gap-2 text-sm font-bold text-gray-700 transition-all hover:scale-105 active:scale-95"
                >
                    {isPlaying ? <X size={16} /> : <Play size={16} fill="currentColor" />}
                    <span className="hidden sm:inline">{isPlaying ? t('Stop') : t('Preview')}</span>
                </button>

                <button
                    onClick={handleExport}
                    disabled={isExporting || waypoints.length < 2}
                    className="h-10 pl-4 pr-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-xl shadow-blue-500/30 flex items-center gap-2 text-sm font-bold transition-all hover:scale-105 active:scale-95 hover:shadow-blue-500/50"
                >
                    {isExporting ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                    {isExporting ? t('Recording...') : t('Export Video')}
                </button>
            </div>

            {/* 4. Recording Indicator */}
            {isExporting && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-red-500/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-2xl animate-pulse z-50">
                    <div className="w-3 h-3 bg-white rounded-full animate-ping" />
                    <span className="font-bold tracking-wider">RECORDING SCENE...</span>
                </div>
            )}
        </div>
    );
}
