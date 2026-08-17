/**
 * Name-based employee lookup. Typed names are never the database identity —
 * resolve to immutable employee UUID after auth.
 */

import type { TimeEmployee } from "@/lib/time/types";

export function normalizePersonName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s'-]/g, "")
    .replace(/\s+/g, " ");
}

export function namesMatch(a: string, b: string): boolean {
  return normalizePersonName(a) === normalizePersonName(b);
}

/** Active employees whose first+last match (case/accent-insensitive). */
export function findEmployeesByName(
  employees: TimeEmployee[],
  firstName: string,
  lastName: string,
): TimeEmployee[] {
  const first = normalizePersonName(firstName);
  const last = normalizePersonName(lastName);
  if (!first || !last) return [];
  return employees.filter(
    (e) => e.active && namesMatch(e.firstName, first) && namesMatch(e.lastName, last),
  );
}
