import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without these, the dev server refuses its own scripts when the app is opened through
  // a proxy or a non-localhost hostname, and the page never becomes interactive.
  allowedDevOrigins: ["127.0.0.1", "*.localhost", "**.cursor.sh", "**.cursor.com", "**.cursorapi.com"],
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    // cursor/identity.ts imports its sibling with a ".js" specifier, which Turbopack doesn't map to ".ts".
    resolveAlias: { "./identity.dev.js": "./cursor/identity.dev.ts" },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
