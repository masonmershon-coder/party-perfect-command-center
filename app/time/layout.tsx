import type { Metadata, Viewport } from "next";
import { Outfit, Nunito } from "next/font/google";
import "../jobs/jobs.css";
import "./time.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-jobs-display",
  weight: ["600", "700", "800"],
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-jobs-body",
  weight: ["500", "600", "700", "800"],
});

const TITLE = "Party Perfect Time";
const DESCRIPTION = "Clock in at Party Perfect Event Rentals.";

export const metadata: Metadata = {
  metadataBase: new URL("https://partyperfect.app"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: TITLE,
  robots: { index: false, follow: false },
  manifest: "/time/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/time/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/time/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/time/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: TITLE,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#00bfa5",
};

export default function TimeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`jobs-root ${outfit.variable} ${nunito.variable}`}
      style={
        {
          "--jobs-font-display": "var(--font-jobs-display), Outfit, sans-serif",
          "--jobs-font-body": "var(--font-jobs-body), Nunito, sans-serif",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
