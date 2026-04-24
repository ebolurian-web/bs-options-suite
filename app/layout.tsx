import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Libre_Baskerville } from "next/font/google";
import "./globals.css";
import { FocusOnRouteChange } from "@/components/focus-on-route-change";

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

const SITE_URL = "https://options.bolurian.com";
const SITE_NAME = "BS Options Suite";
const SITE_DESCRIPTION =
  "Black-Scholes options pricing suite. Live market data, 3D volatility surface, multi-leg strategy builder with net position Greeks. Built by Eden Bolurian.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Options Analytics`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Eden Bolurian", url: "https://bolurian.com" }],
  keywords: [
    "Black-Scholes",
    "options pricing",
    "volatility surface",
    "implied volatility",
    "options Greeks",
    "strategy builder",
    "quant finance",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Options Analytics`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Options Analytics`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
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
        <div className="bs-backdrop" aria-hidden="true" />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <FocusOnRouteChange />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
