"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Trash2 } from 'lucide-react';

interface ProjectSummary {
    id: string;
    title: string;
    updatedAt: string;
}

export default function LandingPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);

    const fetchProjects = useCallback(() => {
        fetch('/api/projects')
            .then(res => res.json())
            .then((data: ProjectSummary[] | { error: string }) => {
                setProjects(Array.isArray(data) ? data : []);
            })
            .catch(console.error);
    }, []);

    useEffect(() => { fetchProjects(); }, [fetchProjects]);

    const handleStart = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/projects', { method: 'POST' });
            const data = await res.json();
            if (data.id) {
                router.push(`/projects/${data.id}/editor`);
                return;
            }
            throw new Error(data.error ?? 'Unknown error');
        } catch (err) {
            console.error(err);
            alert("Error creating project");
            setLoading(false);
        }
    };

    // Delete Confirmation State
    const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

    const handleDeleteClick = (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation();
        setProjectToDelete(projectId);
    };

    const confirmDelete = async () => {
        if (!projectToDelete) return;
        try {
            const res = await fetch(`/api/projects/${projectToDelete}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`Delete failed (${res.status})`);
            setProjectToDelete(null);
            fetchProjects(); // Refresh list
        } catch (err) {
            console.error(err);
            alert("Failed to delete project");
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-blue-500/30">
            {/* Static Background Image (no live Mapbox map — avoids billing on every visit) */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <Image
                    src="/demo-poster.jpg"
                    alt=""
                    aria-hidden="true"
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover"
                />
                <div className="absolute inset-0 bg-black/75" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.85)_70%)]" />
            </div>

            {/* Hero Section */}
            <div className="relative z-10 flex flex-col items-center justify-center min-h-[85vh] px-4 overflow-hidden">
                {/* Background Effects (kept for atmosphere over the static poster) */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent z-0 pointer-events-none" />
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-50" />

                <div className="relative z-10 text-center max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-1000">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-4">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        3D Travel Animation
                    </div>

                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 pb-2">
                        Sunsky.ai
                    </h1>

                    <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed">
                        Create cinematic travel route animations in seconds. <br className="hidden md:block" />
                        Export high-quality videos for your content.
                    </p>

                    <button
                        onClick={handleStart}
                        disabled={loading}
                        className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-black text-lg font-bold rounded-full hover:bg-zinc-200 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Create Map Animation"}
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </button>

                    <p className="text-xs text-zinc-600 uppercase tracking-widest pt-8">Powered by Mapbox GL 3D</p>
                </div>
            </div>

            {/* Project Dashboard */}
            {projects.length > 0 && (
                <div className="max-w-6xl mx-auto px-6 py-24 border-t border-white/5">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">Your Previous Trips</h2>
                        <span className="text-sm text-zinc-500">{projects.length} Projects</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((p) => (
                            <div
                                key={p.id}
                                onClick={() => router.push(`/projects/${p.id}/editor`)}
                                className="group cursor-pointer bg-zinc-900/50 border border-white/5 hover:border-blue-500/50 rounded-2xl p-6 transition-all hover:bg-zinc-900 relative overflow-hidden backdrop-blur-sm"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="relative flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-xl">
                                        🌍
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteClick(e, p.id)}
                                        className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors z-10"
                                        title="Delete Project"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="relative">
                                    <h3 className="font-bold text-xl mb-1 text-zinc-100 group-hover:text-white transition-colors truncate">{p.title || "Untitled Trip"}</h3>
                                    <p className="text-sm text-zinc-500">
                                        Last updated: {new Date(p.updatedAt).toLocaleDateString()}
                                    </p>
                                </div>

                                <div className="mt-6 flex items-center text-sm font-medium text-blue-500 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                                    Open Editor <span className="ml-2">→</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 5. Delete Confirmation Modal */}
            {projectToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full space-y-4 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="space-y-2 text-center">
                            <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-2">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-white">Delete Project?</h3>
                            <p className="text-zinc-400 text-sm">
                                This action cannot be undone. This will permanently delete your travel route animation.
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setProjectToDelete(null)}
                                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="border-t border-white/5 py-12 text-center text-zinc-600 text-sm">
                <div className="flex justify-center gap-6 mb-4">
                    <a href="#" className="hover:text-zinc-400 transition-colors">Terms</a>
                    <a href="#" className="hover:text-zinc-400 transition-colors">Privacy</a>
                    <a href="#" className="hover:text-zinc-400 transition-colors">Contact</a>
                </div>
                <p>&copy; 2024 TravelRoute Studio. All rights reserved.</p>
            </footer>
        </div>
    );
}
