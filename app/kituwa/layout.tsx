import { Syne, IBM_Plex_Mono, Press_Start_2P } from "next/font/google";
import type { Metadata, Viewport } from "next";
import "./kituwa.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-kituwa-display",
  weight: ["600", "700", "800"],
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-kituwa-mono",
  weight: ["400", "500", "600"],
});

const pixel = Press_Start_2P({
  subsets: ["latin"],
  variable: "--font-kituwa-pixel",
  weight: "400",
});

const TITLE = "KITUWA";
const DESCRIPTION = "Talk to Matter.";

export const metadata: Metadata = {
  metadataBase: new URL("https://kituwa.app"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: TITLE,
  robots: { index: false, follow: false },
  manifest: "/kituwa/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/kituwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/kituwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/kituwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: TITLE,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05070c",
};

export default function KituwaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`kituwa-root ${syne.variable} ${plex.variable} ${pixel.variable}`}>
      {children}
    </div>
  );
}
