import type { ReactNode } from 'react';

export const metadata = { title: 'YOUR LABEL — Account', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body style={{ margin: 0, fontFamily: 'Arial, sans-serif' }}>{children}</body></html>;
}
