import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kimemiah Home",
    short_name: "Kimemiah",
    description: "Stock, shopping, jobs and money for the Kimemiah household.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F2F0",
    theme_color: "#FFFFFF",
    // Share an M-Pesa SMS to the app: it fills the amount on the basket's pay sheet, or on Money.
    share_target: { action: "/shop/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
