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

// Pre-paint theme + accent so a stored theme never flashes the wrong palette.
// Reads the zustand-persist state directly (mirrors src/lib/themes.ts) — update
// ids/hexes here when the catalogue changes. Runs before first paint.
const PREPAINT_THEME = `(function(){try{
var r=document.documentElement;
var s=null;try{s=JSON.parse(localStorage.getItem("medusa-os-v1")||"null")}catch(e){}
var st=(s&&s.state&&s.state.settings)||null;
var t=(st&&st["theme"])||"eclipse";
var mig={"light":"porcelain","dark":"eclipse","glass":"lilac","blacklime":"eclipse","aurora":"vapor","indigoblack":"abyss","daylight":"porcelain","paper":"sundial","mist":"sage","blush":"lilac","midnight":"eclipse","graphite":"abyss","obsidian":"eclipse","horizon":"vapor"};
if(mig[t])t=mig[t];
var valid={"porcelain":1,"sage":1,"sundial":1,"lilac":1,"eclipse":1,"abyss":1,"ember":1,"vapor":1};
if(!valid[t])t="eclipse";
r.classList.add("theme-"+t);
if(t==="eclipse"||t==="abyss"||t==="ember"||t==="vapor")r.classList.add("dark");
var a=st&&st["accent"];
var ac={"violet":"#8b5cf6","blue":"#3b82f6","cyan":"#06b6d4","emerald":"#10b981","amber":"#f59e0b","rose":"#f43f5e"};
if(a&&ac[a])r.style.setProperty("--accent",ac[a]);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_THEME }} />
        <ThemeProvider><AuthGate><AppLock>{children}<CommandPalette /><Toaster /></AppLock></AuthGate></ThemeProvider>
      </body>
    </html>
  );
}
