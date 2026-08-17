import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      name: "KITUWA",
      short_name: "KITUWA",
      description: "Talk to Matter.",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      display_override: ["standalone"],
      orientation: "portrait",
      background_color: "#05070c",
      theme_color: "#05070c",
      icons: [
        {
          src: "/kituwa/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/kituwa/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/kituwa/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    },
  );
}
