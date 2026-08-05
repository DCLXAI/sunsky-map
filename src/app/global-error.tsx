"use client";

import { useEffect } from "react";

/** Catches failures in the root layout itself, so it must render its own
 *  <html> and <body> and cannot rely on any app styling. */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Unhandled root error:", error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#050505",
                    color: "#fff",
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    padding: "1.5rem",
                }}
            >
                <div style={{ maxWidth: "28rem", textAlign: "center" }}>
                    <div style={{ fontSize: "3rem" }}>🌥️</div>
                    <h1 style={{ fontSize: "1.5rem", margin: "1rem 0 0.5rem" }}>
                        Something went wrong
                    </h1>
                    <p style={{ color: "#a1a1aa", fontSize: "0.875rem", lineHeight: 1.6 }}>
                        Sunsky.ai failed to load. Reloading usually fixes it.
                    </p>
                    {error.digest && (
                        <p
                            style={{
                                color: "#52525b",
                                fontSize: "0.75rem",
                                fontFamily: "monospace",
                            }}
                        >
                            Reference: {error.digest}
                        </p>
                    )}
                    <button
                        onClick={reset}
                        style={{
                            marginTop: "1.25rem",
                            padding: "0.625rem 1.25rem",
                            background: "#fff",
                            color: "#000",
                            border: "none",
                            borderRadius: "9999px",
                            fontSize: "0.875rem",
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
