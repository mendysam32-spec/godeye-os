import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthGate } from "@/components/auth-gate";
import { AppLock } from "@/components/app-lock";
import { CommandPalette } from "@/components/command-palette";
import { Toaster } from "@/components/toast";

const inter = Inter({ variable: "--font-inter-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MEDUSA — Workforce OS",
  description: "MEDUSA by S&P Group. Build, run and scale AI workforces with any LLM provider.",
};

// Fixed viewport for phones/tablets: keep the page at device width, never let
// the visual viewport shrink (keyboard/zoom) so chat doesn't randomly zoom out.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ThemeProvider><AuthGate><AppLock>{children}<CommandPalette /><Toaster /></AppLock></AuthGate></ThemeProvider>
      </body>
    </html>
  );
}
