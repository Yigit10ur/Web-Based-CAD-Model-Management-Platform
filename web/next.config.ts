import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Build a self-contained server under `.next/standalone`, with only the
   * dependencies actually reached traced into it.
   *
   * For running the application somewhere that is not Vercel: the alternative
   * is shipping the whole `node_modules` tree and hoping the install on the
   * target machine matches the one the build was tested against. Vercel
   * ignores this and builds the way it always did.
   */
  output: "standalone",
};

export default nextConfig;
