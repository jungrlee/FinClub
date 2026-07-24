/** @type {import('next').NextConfig} */
const nextConfig = {
  // yahoo-finance2's ESM build pulls in a Deno-only test helper
  // (@std/testing/mock) that Next's bundler cannot resolve. Marking it
  // external means Node require()s it at runtime in the serverless function
  // instead of bundling it. Next 14 uses the experimental key.
  experimental: {
    serverComponentsExternalPackages: ["yahoo-finance2"],
  },
};

export default nextConfig;
