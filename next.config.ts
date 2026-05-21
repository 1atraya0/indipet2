import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
