import type { NextConfig } from "next";

// pdfkit loads its built-in fonts (Helvetica etc.) through "#standard-fonts/*" imports, which
// Vercel's file tracing can't follow, so they're added by hand to every route that makes a PDF.
const pdfFiles = ["./node_modules/pdfkit/js/standard-fonts/**", "./node_modules/pdfkit/package.json"];

const nextConfig: NextConfig = {
  // The PDF renderer loads fonts and images at run time, so it stays a plain Node package.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Going back to a page you were just on shows it straight away instead of loading it again.
  // Anything you change still clears this, so it only skips pages nothing has changed on.
  experimental: { staleTimes: { dynamic: 30 } },
  outputFileTracingIncludes: {
    "/documents": pdfFiles,
    "/settings/documents": pdfFiles,
  },
};

export default nextConfig;
