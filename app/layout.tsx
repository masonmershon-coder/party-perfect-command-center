import type { Metadata } from "next";
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
