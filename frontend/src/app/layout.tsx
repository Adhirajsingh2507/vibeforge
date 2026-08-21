import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TerraSight",
  description:
    "Onboard Edge-AI perception for autonomous planetary rovers — live terrain map, zone classification, and construction Safety Score.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
