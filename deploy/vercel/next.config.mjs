/** Keep this Next.js target separate from the original Sites Worker. */
export default {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@libsql/client', 'sharp'],
  async headers() {
    return [
      {source:'/:path*',headers:[
        {key:'X-Content-Type-Options',value:'nosniff'},
        {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
        {key:'X-Frame-Options',value:'SAMEORIGIN'}
      ]},
      {source:'/assets/:file([A-Za-z0-9_-]+-[a-f0-9]{12}-[0-9]+[.]webp)',headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]},
      {source:'/try-on',headers:[
        {key:'Cache-Control',value:'private, no-store'},
        {key:'Referrer-Policy',value:'no-referrer'},
        {key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'; object-src 'none'"}
      ]}
    ];
  }
};
