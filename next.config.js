/** @type {import('next').NextConfig} */
const nextConfig = {
  // For static export (needed for Netlify)
  output: 'export',
  trailingSlash: true,

  // Disable image optimization for static export
  images: {
    unoptimized: true
  },

  // Ensure proper base path for deployment
  basePath: '',
  assetPrefix: '',

  // Allow iframe embedding
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors *',
          },
        ],
      },
    ]
  },

  // Disable server-side features for static export
  experimental: {
    // None needed for this project
  }
}

module.exports = nextConfig