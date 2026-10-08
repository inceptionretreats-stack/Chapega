import type { Metadata } from "next";
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
