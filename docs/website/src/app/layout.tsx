import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import Script from 'next/script';
import { GoogleTagManager } from '@next/third-parties/google';
import { InkeepScript } from "@/components/inkeep-script";
import { Provider } from "./provider";
import 'katex/dist/katex.css';
import { docsRootMetadataRobots } from '@/lib/docs-indexing';
import { DOCS_PRODUCTION_HOSTNAME, DOCS_SITE_ORIGIN } from '@/lib/docs-open-graph';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_SITE_ORIGIN),
  title: {
    default: 'QVAC by Tether',
    template: '%s | QVAC',
  },
  description: 'Official documentation and single source of truth for QVAC.',
  icons: {
    icon: '/qvac-favicon.svg',
  },
  robots: docsRootMetadataRobots(),
};

const gtmId = process.env.NEXT_PUBLIC_GTM_ID ?? 'GTM-WDD9NCZ4';

/** Static script; hostname read from `data-docs-production-hostname` on `<html>` (avoids interpolating into JS for CodeQL). */
const NOINDEX_NON_PRODUCTION_HOST_SCRIPT =
  '(function(){var p=document.documentElement.getAttribute("data-docs-production-hostname");var h=typeof location!=="undefined"?location.hostname:"";if(p&&h&&h!==p){var m=document.createElement("meta");m.setAttribute("name","robots");m.setAttribute("content","noindex, nofollow");document.head.appendChild(m);}})();';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html 
      lang="en" 
      suppressHydrationWarning
      className={inter.className}
      data-docs-production-hostname={DOCS_PRODUCTION_HOSTNAME}>
      {gtmId && <GoogleTagManager gtmId={gtmId} />}
      <body className="flex flex-col min-h-screen">
        <Script
          id="docs-robots-non-production-host"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: NOINDEX_NON_PRODUCTION_HOST_SCRIPT }}
        />
        <InkeepScript />
          <Provider>{children}</Provider>
      </body>
    </html>
  );
}
