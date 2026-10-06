import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Cee Essence | Spa & Wellness", description: "Where beauty meets refined wellness." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
