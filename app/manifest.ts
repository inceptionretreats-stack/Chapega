import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chapega.com gift kiosk",
    short_name: "Chapega",
    description: "Browse personalized gifts and prepare a Pay at Counter order on WhatsApp.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff9f2",
    theme_color: "#7a263a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
