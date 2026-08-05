export default function Loading() {
    return (
        <div className="h-screen w-full bg-black flex items-center justify-center">
            <div className="flex items-center gap-3 text-white/70 font-mono text-sm">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                LOADING EDITOR…
            </div>
        </div>
    );
}
