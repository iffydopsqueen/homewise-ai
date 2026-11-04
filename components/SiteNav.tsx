"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "./ThemeProvider";
import ThemeSelector from "./ThemeSelector";

// Persistent primary navigation (dashboard restructuring, P1). What-If
// stays hidden until that feature is implemented and ready.
const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/affordability", label: "Affordability" },
  { href: "/property-costs", label: "Property Costs" },
  { href: "/compare", label: "Compare Properties" },
] as const;

// One link list serves both layouts (T3d.2): a centered row on sm+ screens
// and a hamburger-toggled vertical menu below that. A single list keeps
// every destination's accessible name unique, so existing navigation
// locators keep resolving to exactly one link on desktop.
export default function SiteNav() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Any successful navigation closes the mobile menu, including
  // back/forward and non-nav links. Render-phase sync (not an effect):
  // React re-renders before committing, so no cascade occurs. Focus stays
  // where the browser puts it after the link unmounts (document body):
  // the only programmatic focus move is Escape dismissal below.
  const [navKey, setNavKey] = useState(pathname);
  if (navKey !== pathname) {
    setNavKey(pathname);
    setOpen(false);
  }

  // Escape dismisses an open menu from anywhere and restores focus to the
  // menu button. Effect-only, so no browser API runs during SSR.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  return (
    // Desktop is a 1fr/auto/1fr grid: the links stay truly centered while
    // the theme selector docks right, with no absolute overlap at any
    // width. Mobile ignores the grid (block flow): brand bar, menu list,
    // then the menu's own selector.
    <nav
      aria-label="Primary"
      className="border-b border-t-line py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4"
    >
      <div className="flex items-center justify-between sm:hidden">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="rounded-sm text-base font-bold text-t-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-t-focus"
        >
          HomeWise AI
        </Link>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="primary-nav-list"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          className="rounded-md border border-t-line-strong px-3 py-1.5 text-sm font-semibold text-t-ink hover:bg-t-secondary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-t-focus"
        >
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>
      </div>
      {/* Empty balance cell: keeps the desktop link row centered against
          the right-hand theme selector. Hidden on mobile (block flow). */}
      <div className="hidden sm:block" aria-hidden="true" />
      <ul
        id="primary-nav-list"
        className={
          open
            ? "flex flex-col gap-1 whitespace-nowrap pt-3 sm:flex-row sm:justify-center sm:gap-6 sm:pt-0"
            : "hidden gap-6 whitespace-nowrap sm:flex sm:justify-center"
        }
      >
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={
                  active
                    ? "block rounded-sm px-2 py-2 text-sm font-semibold text-t-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-t-focus sm:inline-block sm:px-0 sm:py-1"
                    : "block rounded-sm px-2 py-2 text-sm text-t-muted hover:text-t-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-t-focus sm:inline-block sm:px-0 sm:py-1"
                }
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="hidden justify-end sm:flex">
        <ThemeSelector
          idPrefix="theme-desktop"
          value={theme}
          onChange={setTheme}
        />
      </div>
      <div className={open ? "pt-3 sm:hidden" : "hidden"}>
        <ThemeSelector
          idPrefix="theme-mobile"
          value={theme}
          onChange={setTheme}
        />
      </div>
    </nav>
  );
}
