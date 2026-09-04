import type { Metadata, Viewport } from 'next';
import { Schibsted_Grotesk } from 'next/font/google';
import './globals.css';

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://micamapp.de'),
  title: 'Mica – Freie Zeit wird gemeinsame Zeit',
  description: 'Mit Mica teilt ihr freie Momente, macht daraus einen Plan und findet wieder häufiger zusammen.',
  openGraph: {
    title: 'Mica – Freie Zeit wird gemeinsame Zeit',
    description: 'Spontane Treffen im bestehenden Freundeskreis – bald für iOS und Android.',
    locale: 'de_DE',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#070910',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={schibsted.variable}>
      <body>{children}</body>
    </html>
  );
}
