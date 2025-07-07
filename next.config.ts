
import type {NextConfig} from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development', // Re-enabled for easier debugging
  register: true,
  skipWaiting: true,
  reloadOnOnline: true,
  // cacheOnFrontEndNav: true, // Commenting out to simplify
  // aggressiveFrontEndNavCaching: true, // Commenting out to simplify
  workboxOptions: {
    // Exclude GTM scripts from precaching
    exclude: [
        /googletagmanager\.com/,
        // Can add more patterns here if other scripts should not be precached
    ],
    runtimeCaching: [
      {
        urlPattern: /googletagmanager\.com/,
        handler: "NetworkFirst", // Or "NetworkOnly" if GTM should never be cached
        options: {
          cacheName: "gtm-cache",
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 5, // Cache only a few GTM related files
            maxAgeSeconds: 1 * 24 * 60 * 60, // Cache for 1 day
          },
          cacheableResponse: {
            statuses: [0, 200], // Cache opaque and successful responses
          },
        },
      },
      // General strategy for other cross-origin requests
      {
        urlPattern: /^https?.*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'cross-origin-cache',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 7 * 24 * 60 * 60, // Cache for 7 Days
          },
          cacheableResponse: {
            statuses: [0, 200], // Cache opaque responses
          },
        },
      },
      // You might want specific strategies for fonts, images from CDNs, etc.
      // For example, caching Google Fonts:
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'google-fonts-stylesheets',
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          cacheableResponse: {
            statuses: [0, 200],
          },
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 30 * 24 * 60 * 60, // Cache for 30 days
          },
        },
      },
    ],
    disableDevLogs: true, // Good for production, also helps avoid console noise during dev if enabled
  },
});

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'wecanfix.in',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'fixbro.in',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ad.fixbro.in',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withPWA(nextConfig);
