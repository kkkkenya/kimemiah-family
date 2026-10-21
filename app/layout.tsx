import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Young_Serif } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  adjustFontFallback: false, // next/font has no metrics for this newer face yet
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Kimemiah Home",
  description: "Stock, shopping, jobs and money for the Kimemiah household.",
  applicationName: "Kimemiah Home",
  appleWebApp: { capable: true, title: "Kimemiah", statusBarStyle: "default" },
  robots: { index: false, follow: false },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F4D5" },
    { media: "(prefers-color-scheme: dark)", color: "#072A1C" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-KE" className={`${atkinson.variable} ${youngSerif.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
