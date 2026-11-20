import type {Metadata, Viewport} from 'next';
import {Lora, Plus_Jakarta_Sans} from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
});

export const viewport: Viewport = {
  themeColor: '#0b0b0d',
};

export const metadata: Metadata = {
  title: 'World Book Records — Every Book Makes History',
  description:
    'Every Book Makes History. Discover remarkable books, meet the minds behind them, and share your stories with a global reading community.',
  openGraph: {
    title: 'World Book Records — Every Book Makes History',
    description:
      'Every Book Makes History. Discover remarkable books, meet the minds behind them, and share your stories with a global reading community.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'World Book Records — Every Book Makes History',
    description:
      'Every Book Makes History. Discover remarkable books, meet the minds behind them, and share your stories with a global reading community.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${lora.variable} scroll-smooth`}>
      <body
        suppressHydrationWarning
        className="bg-[#0b0b0d] text-[#f7f4ed] font-sans antialiased selection:bg-[#d8b35d]/30 selection:text-[#f2d58b]"
      >
        {children}
      </body>
    </html>
  );
}
