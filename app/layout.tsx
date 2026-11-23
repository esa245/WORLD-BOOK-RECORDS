import type {Metadata, Viewport} from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
    <html lang="en" className="scroll-smooth">
      <body
        suppressHydrationWarning
        className="bg-[#0b0b0d] text-[#f7f4ed] font-sans antialiased selection:bg-[#d8b35d]/30 selection:text-[#f2d58b]"
      >
        {children}
      </body>
    </html>
  );
}
