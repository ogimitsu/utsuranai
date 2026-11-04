import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 台帳JSONと日付シミュレーター(cookie)を毎リクエスト読むため、Cache Components は使わない
  cacheComponents: false,
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
