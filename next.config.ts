import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without these, the dev server refuses its own scripts when the app is opened through
  // a proxy or a non-localhost hostname, and the page never becomes interactive.
  allowedDevOrigins: ["127.0.0.1", "*.localhost", "**.cursor.sh", "**.cursor.com", "**.cursorapi.com"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
