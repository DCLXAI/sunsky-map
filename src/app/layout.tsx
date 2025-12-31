import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "TravelRoute Studio",
    description: "Turn your trips into cinematic map animations",
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
