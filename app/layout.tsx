import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { validateWebEnvAtStartup } from '@/lib/env/web-env';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Backtrack MVP',
  description: 'Local multiplayer MVP for Backtrack',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  validateWebEnvAtStartup();

  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
