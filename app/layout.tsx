import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./atelier.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Chapega.com", template: "%s | Chapega.com" },
  description:
    "Browse personalized gifts and prepare a Pay at Counter order for Chapega.com on WhatsApp.",
};

// Static (the root layout stays prerenderable): tells the browser both colour
// schemes are supported so a dark system gets a dark canvas before CSS loads.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff9f2" },
    { media: "(prefers-color-scheme: dark)", color: "#231a1f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${playfair.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>{children}</body>
    </html>
  );
}
