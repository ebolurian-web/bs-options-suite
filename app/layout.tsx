import type { Metadata } from "next";
import { Geist, Geist_Mono, Libre_Baskerville } from "next/font/google";
import "./globals.css";

// Inlined here rather than wrapped in a component because React 19 / Next 16
// doesn't execute <script> children inside components on the client.
const THEME_INIT_SCRIPT = `(function(){try{
  var s = localStorage.getItem('theme');
  document.documentElement.dataset.theme = s === 'light' ? 'light' : 'dark';
}catch(e){document.documentElement.dataset.theme='dark';}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const libre = Libre_Baskerville({
  weight: ["400", "700"],
  variable: "--font-libre",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BS Options Suite",
  description:
    "Black-Scholes options pricing, 3D volatility surface, and multi-leg strategy builder with live market data.",
  authors: [{ name: "Eden Bolurian" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${libre.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
