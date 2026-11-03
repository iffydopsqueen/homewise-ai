import type { Metadata } from "next";
import type { ReactNode } from "react";
import Disclaimer from "../components/Disclaimer";
import SiteNav from "../components/SiteNav";
import { SessionProvider } from "../lib/session/store";
import "./globals.css";

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
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 sm:px-6">
          <SiteNav />
          <div className="flex-1">
            <SessionProvider>{children}</SessionProvider>
          </div>
          <footer className="border-t border-slate-200 py-6">
            <Disclaimer />
          </footer>
        </div>
      </body>
    </html>
  );
}
