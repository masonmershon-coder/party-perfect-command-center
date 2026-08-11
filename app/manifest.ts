import type { MetadataRoute } from "next";

// PWA manifest so the phone interface can be added to the iPhone Home Screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Party Perfect AI",
    short_name: "Matter",
    description: "Mershon AI — phone control surface for AI Core (Matter / Mike).",
    start_url: "/matter",
    scope: "/matter",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}
