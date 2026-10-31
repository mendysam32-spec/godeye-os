import type { MetadataRoute } from "next";

/**
 * PWA web manifest — served at /manifest.webmanifest. The Android TWA
 * (android/ folder, built with Bubblewrap) reads its name, icons, colors and
 * display behavior from this file, so keep the icon paths in sync with
 * public/icons/ and scripts/gen-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MEDUSA OS",
    short_name: "MEDUSA",
    description: "AI-powered personal operating system — chat, workforce, projects and a real terminal.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "en",
    background_color: "#0b0e15",
    theme_color: "#0b0e15",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
