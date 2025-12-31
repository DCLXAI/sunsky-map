"use client";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
    return (
        <SonnerToaster
            position="bottom-center"
            toastOptions={{
                style: {
                    background: "rgba(255, 255, 255, 0.9)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    color: "#1e293b",
                    fontSize: "14px",
                    fontWeight: 500,
                },
            }}
        />
    );
}
