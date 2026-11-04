import type { Metadata } from "next";
import type { ReactNode } from "react";
import Disclaimer from "../components/Disclaimer";
import SiteNav from "../components/SiteNav";
import { ThemeProvider } from "../components/ThemeProvider";
import { SessionProvider } from "../lib/session/store";
import "./globals.css";

// Pre-hydration appearance restore (T3d.3-I). Runs synchronously before
// first paint so a returning visitor never flashes the default theme.
// Defensive: invalid values fall through to Natural, storage exceptions
// are swallowed, and only the appearance key is ever read.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("homewise-theme");if(t==="light"||t==="natural"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export const metadata: Metadata = {
  description:
    "AI-assisted homebuying affordability and property comparison.",
  title: "HomeWise AI",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    // data-theme="natural" is the SSR default; the init script may change
    // it pre-hydration for returning visitors, hence the scoped warning
    // suppression on this attribute difference only.
    <html lang="en" data-theme="natural" suppressHydrationWarning>
      <body className="bg-t-page text-t-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 sm:px-6">
          <ThemeProvider>
            <SiteNav />
            <div className="flex-1">
              <SessionProvider>{children}</SessionProvider>
            </div>
          </ThemeProvider>
          <footer className="border-t border-t-line py-6">
            <Disclaimer />
          </footer>
        </div>
      </body>
    </html>
  );
}
