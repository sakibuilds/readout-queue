import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Readout Queue",
  description: "Prepare a batch of spoken scripts for voice rendering.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
