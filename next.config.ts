import type { NextConfig } from "next";

// pdfkit loads its built-in fonts (Helvetica etc.) through "#standard-fonts/*" imports, which
// Vercel's file tracing can't follow, so they're added by hand to every route that makes a PDF.
const pdfFiles = ["./node_modules/pdfkit/js/standard-fonts/**", "./node_modules/pdfkit/package.json"];

const nextConfig: NextConfig = {
  // The PDF renderer loads fonts and images at run time, so it stays a plain Node package.
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/documents": pdfFiles,
    "/settings/documents": pdfFiles,
  },
};

export default nextConfig;
