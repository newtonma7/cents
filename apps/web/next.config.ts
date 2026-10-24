import type { NextConfig } from "next";

const apiUrl = new URL(process.env.API_ORIGIN ?? "http://127.0.0.1:3001");
if (!["http:", "https:"].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password ||
    apiUrl.pathname !== "/" || apiUrl.search || apiUrl.hash) {
  throw new Error("API_ORIGIN must be an HTTP origin.");
}
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  logging: { incomingRequests: { ignore: [/^\/auth\/confirm(?:[/?]|$)/] } },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: apiUrl.origin + "/api/:path*" },
      { source: "/auth/confirm", destination: apiUrl.origin + "/auth/confirm" },
    ];
  },
};
export default nextConfig;
