import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  agentRules: false,
  output: 'export',
  images: { unoptimized: true },
  turbopack: { root: resolve(process.cwd(), '..') },
};

export default nextConfig;
