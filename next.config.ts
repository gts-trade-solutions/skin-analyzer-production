import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native / heavy server-only deps out of the bundle so they load from
  // node_modules at runtime (sharp ships native binaries).
  serverExternalPackages: ["sharp", "@aws-sdk/client-s3"],
};

export default nextConfig;
