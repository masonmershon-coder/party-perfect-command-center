import type { Metadata, Viewport } from "next";
import { Outfit, Nunito } from "next/font/google";
import "./jobs.css";

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

const JOBS_TITLE = "Party Perfect Jobs | Tulsa Event Rentals Careers";
const JOBS_DESCRIPTION =
  "Join Party Perfect Event Rentals in Tulsa. Apply in under 4 minutes — showroom, sales, linens, delivery, tents, and warehouse roles.";

export const metadata: Metadata = {
  metadataBase: new URL("https://partyperfectjobs.com"),
  title: JOBS_TITLE,
  description: JOBS_DESCRIPTION,
  applicationName: "Party Perfect Jobs",
  keywords: [
    "Party Perfect Jobs",
    "Party Perfect Tulsa jobs",
    "event rental jobs Tulsa",
    "warehouse jobs Tulsa",
    "delivery driver jobs Tulsa",
    "tent crew hiring",
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://partyperfectjobs.com/",
  },
  openGraph: {
    type: "website",
    url: "https://partyperfectjobs.com/",
    siteName: "Party Perfect Jobs",
    title: JOBS_TITLE,
    description: JOBS_DESCRIPTION,
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
    title: JOBS_TITLE,
    description: JOBS_DESCRIPTION,
    images: ["/party-perfect-logo.png"],
  },
  icons: {
    icon: "/party-perfect-logo.png",
    apple: "/party-perfect-logo.png",
  },
  appleWebApp: {
    capable: true,
    title: "Party Perfect Jobs",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#00bfa5",
};

export default function JobsLayout({
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
