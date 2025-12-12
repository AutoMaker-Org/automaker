import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN || "",
  },
};

export default nextConfig;
