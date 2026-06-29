import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aria — Create songs with AI",
  description:
    "Describe your song idea in plain language. Aria plans, writes lyrics, composes, and mixes for you.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
