import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Sunsky.ai — Cinematic Travel Route Animations",
    description: "Turn your trips into cinematic 3D map animations and export them as video.",
};

export const viewport: Viewport = {
    themeColor: "#050505",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className="antialiased">
                {children}
            </body>
        </html>
    );
}
