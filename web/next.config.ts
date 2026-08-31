import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Build a self-contained server under `.next/standalone` -- the server plus
   * only the dependencies actually reached -- for running the application in a
   * container. The alternative is shipping the whole `node_modules` tree and
   * hoping the install on the target machine matches the one the build was
   * tested against.
   *
   * Off unless asked for. The hosted deployment builds its own way and has a
   * production release riding on it; a container build is not a reason to
   * change how that one works. `web/Dockerfile` sets this.
   */
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
