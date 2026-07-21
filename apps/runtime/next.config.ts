import type { NextConfig } from 'next'

const assetPrefix = (process.env.RUNTIME_BASE_PATH ?? '').replace(/\/+$/, '')

const nextConfig: NextConfig = {
  assetPrefix: assetPrefix || undefined,
  output: 'standalone',
  transpilePackages: [
    'three',
    '@pascal-app/core',
    '@pascal-app/nodes',
    '@pascal-app/viewer',
    '@pascal-app/plugin-factory-equipment',
  ],
}

export default nextConfig
