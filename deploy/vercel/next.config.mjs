/** Keep this Next.js target separate from the original Sites Worker. */
export default {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@libsql/client'],
  async headers() {
    return [{ source:'/assets/:file([A-Za-z0-9_-]+-[a-f0-9]{12}-[0-9]+[.]webp)',headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]}, { source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' }
    ] }];
  }
};
