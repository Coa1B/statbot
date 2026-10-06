import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StatBot — ask any sports stat",
  description: "Plain-English sports stats answers from live ESPN data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
