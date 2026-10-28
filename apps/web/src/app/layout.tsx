import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cents",
  description: "Prepare one Canonical Listing for multiple marketplaces.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
