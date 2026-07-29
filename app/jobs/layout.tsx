import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Party Perfect Jobs | Tulsa Event Rentals Careers",
  description:
    "Join Party Perfect Event Rentals in Tulsa. Apply in under 4 minutes — showroom, sales, lines, delivery, tents, and more.",
  icons: {
    icon: "/party-perfect-logo.png",
    apple: "/party-perfect-logo.png",
  },
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
