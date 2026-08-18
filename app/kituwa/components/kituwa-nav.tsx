"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/kituwa", label: "Home" },
  { href: "/tower", label: "Tower" },
  { href: "/tasks", label: "Tasks" },
  { href: "/projects", label: "Projects" },
  { href: "/memory", label: "Memory" },
  { href: "/system", label: "System" },
];

export function KituwaNav() {
  const pathname = usePathname();
  return (
    <nav className="kituwa-nav" aria-label="Primary">
      {NAV.map((item) => {
        const active =
          pathname === item.href ||
          pathname === `/kituwa${item.href.replace("/kituwa", "")}` ||
          (item.href !== "/kituwa" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className="kituwa-nav-link"
            data-active={active ? "1" : "0"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
