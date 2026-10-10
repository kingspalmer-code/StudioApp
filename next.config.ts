import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF renderer loads fonts and images at run time, so it stays a plain Node package.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
