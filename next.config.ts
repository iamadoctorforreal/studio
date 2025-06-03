import { NextConfig } from 'next';

const config: NextConfig = {
  webpack: (config, { isServer }) => {
    // Add handlebars to externals for client-side builds
    if (!isServer) {
      config.externals = [...(config.externals || []), 'handlebars'];
    }

    config.resolve.alias = {
      ...config.resolve.alias,
      '@ffmpeg/ffmpeg': '@ffmpeg/ffmpeg/dist/umd/ffmpeg.js',
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
};

export default config;