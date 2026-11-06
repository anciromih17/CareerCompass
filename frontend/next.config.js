/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.E2E_NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
};

module.exports = nextConfig;
