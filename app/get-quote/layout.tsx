import type { Metadata, Viewport } from "next";
import { Outfit, Nunito } from "next/font/google";
import "./get-quote.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-gq-display",
  weight: ["600", "700", "800"],
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-gq-body",
  weight: ["500", "600", "700", "800"],
});

const TITLE = "Get a Rental Quote | Party Perfect Event Rentals Tulsa";
const DESCRIPTION =
  "Full-service event rentals in Tulsa — tents, linens, tables, chairs, china, glassware, dance floors, and décor. Browse inventory, start a quote, request help, or begin a tent consultation. Not a wedding planning company.";

export const metadata: Metadata = {
  metadataBase: new URL("https://partyperfect.app"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Party Perfect Event Rentals",
  keywords: [
    "Party Perfect Event Rentals",
    "event rental Tulsa",
    "tent rental Tulsa",
    "linen rental Tulsa",
    "table chair rental Tulsa",
    "party rental quote",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "https://partyperfect.app/get-quote" },
  openGraph: {
    type: "website",
    url: "https://partyperfect.app/get-quote",
    siteName: "Party Perfect Event Rentals",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/party-perfect-logo.png",
        width: 512,
        height: 512,
        alt: "Party Perfect Event Rentals",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/party-perfect-logo.png"],
  },
  icons: {
    icon: "/party-perfect-logo.png",
    apple: "/party-perfect-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#00bfa5",
};

export default function GetQuoteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`gq-root ${outfit.variable} ${nunito.variable}`}
      style={
        {
          "--gq-font-display": "var(--font-gq-display), Outfit, sans-serif",
          "--gq-font-body": "var(--font-gq-body), Nunito, sans-serif",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
