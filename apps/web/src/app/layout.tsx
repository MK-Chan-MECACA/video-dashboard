import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Video Dashboard',
    template: '%s · Video Dashboard',
  },
  description: 'AI TikTok video production pipeline',
  applicationName: 'Video Dashboard',
  // Private internal tool + tokenized client-review links: keep it out of search indexes.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
