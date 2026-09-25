"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/trade", label: "Trade ideas", short: "Ideas" },
  { href: "/pricer", label: "Option explorer", short: "Explorer" },
  { href: "/strategies", label: "Strategy builder", short: "Builder" },
];

/** Section links; the current page is marked with aria-current and full-strength text. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((l) => {
        const current = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current ? "page" : undefined}
            className="transition-colors hover:underline"
            style={{
              color: current ? "var(--color-fg-default)" : "var(--color-fg-muted)",
              fontWeight: current ? 600 : undefined,
            }}
          >
            <span className="sm:hidden">{l.short}</span>
            <span className="hidden sm:inline">{l.label}</span>
          </Link>
        );
      })}
    </>
  );
}
