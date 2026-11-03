"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Persistent primary navigation (dashboard restructuring, P1). What-If
// stays hidden until that feature is implemented and ready.
const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/affordability", label: "Affordability" },
  { href: "/property-costs", label: "Property Costs" },
  { href: "/compare", label: "Compare Properties" },
] as const;

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="border-b border-slate-200 py-4">
      <ul className="flex gap-6 overflow-x-auto whitespace-nowrap">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "text-sm font-semibold text-slate-900"
                    : "text-sm text-slate-600 hover:text-slate-900 hover:underline"
                }
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
