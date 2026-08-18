/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the production image (web/Dockerfile copies .next/standalone).
  output: "standalone",
};

export default nextConfig;
