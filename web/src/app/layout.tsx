import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Word Chains",
  description: "A daily sequential word puzzle inspired by Wordle and Connections.",
  metadataBase: new URL("https://wordchains.io"),
  openGraph: {
    title: "Word Chains",
    description:
      "Link eight words together in a daily chain puzzle inspired by Wordle and Connections.",
    url: "https://wordchains.io",
    siteName: "Word Chains",
    images: [
      {
        url: "/og-wordchains.png",
        width: 1200,
        height: 630,
        alt: "Word Chains",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Word Chains",
    description:
      "Link eight words together in a daily chain puzzle inspired by Wordle and Connections.",
    images: ["/og-wordchains.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

const gaId = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {gaId ? (
          <>
            <Script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        ) : null}
        {children}
      </body>
    </html>
  );
}
