/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.E2E_NEXT_DIST_DIR || ".next",
  ...(process.env.E2E_BUILD_CPUS ? { experimental: { cpus: Number(process.env.E2E_BUILD_CPUS) } } : {}),
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
