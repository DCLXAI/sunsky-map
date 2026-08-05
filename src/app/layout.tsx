import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Sunsky.ai — Cinematic Travel Route Animations";
const description =
    "Turn your trips into cinematic 3D map animations and export them as video.";

export const metadata: Metadata = {
    metadataBase: new URL("https://sunsky-map.vercel.app"),
    title,
    description,
    openGraph: {
        title,
        description,
        type: "website",
        siteName: "Sunsky.ai",
        images: [
            {
                // The landing background doubles as the share card: it already
                // shows the product's output — a route drawn across the globe.
                url: "/demo-poster.jpg",
                width: 1920,
                height: 1080,
                alt: "A travel route drawn across a 3D globe",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title,
        description,
        images: ["/demo-poster.jpg"],
    },
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
