/** Keep this Next.js target separate from the original Sites Worker. */
export default {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@libsql/client'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' }
    ] }];
  }
};
