import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "./components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Party Perfect Command Center",
  description:
    "Operations dashboard for Party Perfect Event Rentals — Tulsa, Oklahoma",
  icons: {
    icon: "/party-perfect-logo.png",
    apple: "/party-perfect-logo.png",
  },
  appleWebApp: {
    capable: true,
    title: "Command Center",
    statusBarStyle: "default",
  },
};

/** Phone-first viewport — full width on iPhone Safari, safe-area aware. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1018" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-[var(--pp-bg)] text-[var(--pp-text)]">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
