import type { NextConfig } from "next";

const target = process.env.TUTI_TARGET;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_TUTI_TARGET: target ?? "web",
  },
  ...(target === "app"
    ? { output: "export" as const }
    : target === "web"
      ? { output: "standalone" as const }
      : {}),
  images: {
    unoptimized: target === "app",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
