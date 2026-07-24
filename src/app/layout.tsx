import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import PWARegister from '@/components/PWARegister';

const geistSans = Geist({
  variable: '--font-geist-sans',
  // 'latin-ext' chứa toàn bộ ký tự Latin mở rộng, bao gồm chữ có dấu tiếng Việt
  // (ă, ắ, ề, ợ, ữ...). Geist không có subset 'vietnamese' riêng.
  subsets: ['latin', 'latin-ext'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'latin-ext'],
});

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'Máy in từ xa – Remote Print Server',
  description:
    'Hệ thống quản lý và in ấn từ xa – gửi tài liệu đến máy in qua mạng nội bộ hoặc Internet.',
  applicationName: 'MayInKTS',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MayInKTS',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-900 text-slate-100">
        <Providers>{children}</Providers>
        <PWARegister />
      </body>
    </html>
  );
}
