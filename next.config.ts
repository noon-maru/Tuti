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
};

export default nextConfig;
