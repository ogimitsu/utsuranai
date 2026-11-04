import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 台帳JSONと日付シミュレーター(cookie)を毎リクエスト読むため、Cache Components は使わない
  cacheComponents: false,
  // data/*.json は fs で読むため、サーバーバンドルの追跡に明示的に含める（Vercel などで欠けないように）
  outputFileTracingIncludes: {
    "/*": ["./data/**/*.json"],
  },
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
