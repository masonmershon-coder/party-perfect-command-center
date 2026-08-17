import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      name: "Party Perfect Time",
      short_name: "PP Time",
      description: "Clock in at Party Perfect Event Rentals.",
      id: "/time",
      start_url: "/time",
      scope: "/time",
      display: "standalone",
      display_override: ["standalone"],
      orientation: "portrait",
      background_color: "#f4fffc",
      theme_color: "#00bfa5",
      icons: [
        {
          src: "/time/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/time/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/time/icon-maskable-512.png",
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
