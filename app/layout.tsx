import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AG-UI Chat",
  description: "Chat with an AI agent using the AG-UI protocol",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
