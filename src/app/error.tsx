"use client";

import { useEffect } from "react";
import { RotateCcw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Unhandled error:", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-5">
                <div className="text-5xl">🌥️</div>
                <h1 className="text-2xl font-bold">Something went wrong</h1>
                <p className="text-zinc-400 text-sm leading-relaxed">
                    This page hit an unexpected error. Trying again often fixes it — your saved
                    trips are unaffected.
                </p>
                {error.digest && (
                    <p className="text-xs text-zinc-600 font-mono">Reference: {error.digest}</p>
                )}
                <div className="flex gap-3 justify-center pt-2">
                    <button
                        onClick={reset}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full text-sm font-bold hover:bg-zinc-200 transition-colors"
                    >
                        <RotateCcw size={16} />
                        Try again
                    </button>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 text-white rounded-full text-sm font-bold hover:bg-zinc-700 transition-colors"
                    >
                        <Home size={16} />
                        Go home
                    </Link>
                </div>
            </div>
        </div>
    );
}
