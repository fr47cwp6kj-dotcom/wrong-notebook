import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getAppTimeZone } from "@/lib/config";

export const dynamic = 'force-dynamic';

const geistSans = localFont({
  src: './fonts/Geist-Variable.woff2',
  variable: "--font-geist-sans",
  weight: '100 900',
  display: 'swap',
});

const geistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  variable: "--font-geist-mono",
  weight: '100 900',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#146b63',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// 浏览器标题由各页面通过 usePageTitle 设置，这里的 <title> 只作首屏默认值；
// 不放进 metadata，避免 Next 流式输出的 metadata 覆盖页面设置的标题
export const metadata: Metadata = {
  description: "找到知识的缝隙，补上思维的缺口。",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '知隙',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/icons/icon.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>知隙</title>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <Providers timeZone={getAppTimeZone()}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
