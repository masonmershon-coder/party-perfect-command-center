/**
 * Square Labor Timecards API — READ-ONLY Shadow Mode client.
 * Requires TIMECARDS_READ (+ TEAM_READ for names) on SQUARE_ACCESS_TOKEN.
 * Does not write to Square. Wages/tips from Square are ignored.
 */
const SQUARE_VERSION = "2025-05-21";

function squareBase(): string {
  return process.env.SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export type SquareLaborConfig = {
  configured: boolean;
  missing: string[];
  env: string;
};

export function squareLaborConfig(): SquareLaborConfig {
  const missing: string[] = [];
  if (!process.env.SQUARE_ACCESS_TOKEN?.trim()) missing.push("SQUARE_ACCESS_TOKEN");
  if (!process.env.SQUARE_LOCATION_ID?.trim()) missing.push("SQUARE_LOCATION_ID");
  return {
    configured: missing.length === 0,
    missing,
    env: process.env.SQUARE_ENV === "sandbox" ? "sandbox" : "production",
  };
}

export type SquareTimecardBreak = {
  id?: string;
  break_type_id?: string;
  start_at?: string;
  end_at?: string | null;
  name?: string;
};

export type SquareTimecard = {
  id: string;
  team_member_id?: string;
  location_id?: string;
  start_at?: string;
  end_at?: string | null;
  status?: "OPEN" | "CLOSED";
  breaks?: SquareTimecardBreak[];
  updated_at?: string;
  created_at?: string;
};

export type SquareTeamMember = {
  id: string;
  given_name?: string;
  family_name?: string;
  status?: string;
};

async function squareFetch<T>(
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const token = process.env.SQUARE_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, status: 0, error: "SQUARE_ACCESS_TOKEN missing" };
  try {
    const res = await fetch(`${squareBase()}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as T & {
      errors?: { detail?: string; code?: string }[];
    };
    if (!res.ok) {
      const detail =
        data.errors?.map((e) => e.detail || e.code).filter(Boolean).join("; ") ||
        `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: detail };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Incremental search: timecards updated since checkpoint (ISO), plus open shifts. */
export async function searchTimecardsUpdatedSince(opts: {
  updatedAfterIso: string | null;
  locationId?: string;
  limit?: number;
}): Promise<
  | { ok: true; timecards: SquareTimecard[]; cursor: string | null }
  | { ok: false; error: string; status: number }
> {
  const locationId = opts.locationId || process.env.SQUARE_LOCATION_ID?.trim();
  const filter: Record<string, unknown> = {};
  if (locationId) filter.location_ids = [locationId];
  // Always pull OPEN so in-progress days stay current.
  // Also pull CLOSED updated since checkpoint when we have one.
  const pages: SquareTimecard[] = [];
  let cursor: string | null = null;
  let guard = 0;
  do {
    const body: Record<string, unknown> = {
      query: {
        filter: {
          ...filter,
          ...(opts.updatedAfterIso
            ? {
                workday: {
                  date_range: {
                    start_date: opts.updatedAfterIso.slice(0, 10),
                  },
                },
              }
            : {}),
        },
        sort: { field: "UPDATED_AT", order: "ASC" },
      },
      limit: opts.limit ?? 100,
      ...(cursor ? { cursor } : {}),
    };
    const res = await squareFetch<{ timecards?: SquareTimecard[]; cursor?: string }>(
      "/v2/labor/timecards/search",
      body,
    );
    if (!res.ok) return { ok: false, error: res.error, status: res.status };
    pages.push(...(res.data.timecards || []));
    cursor = res.data.cursor || null;
    guard += 1;
  } while (cursor && guard < 40);

  // Filter client-side by updated_at when checkpoint present (API workday filter is coarse).
  const filtered = opts.updatedAfterIso
    ? pages.filter((t) => !t.updated_at || t.updated_at >= opts.updatedAfterIso!)
    : pages;
  return { ok: true, timecards: filtered, cursor: null };
}

export async function searchOpenTimecards(locationId?: string): Promise<
  | { ok: true; timecards: SquareTimecard[] }
  | { ok: false; error: string; status: number }
> {
  const loc = locationId || process.env.SQUARE_LOCATION_ID?.trim();
  const res = await squareFetch<{ timecards?: SquareTimecard[] }>("/v2/labor/timecards/search", {
    query: {
      filter: {
        status: "OPEN",
        ...(loc ? { location_ids: [loc] } : {}),
      },
    },
    limit: 200,
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, timecards: res.data.timecards || [] };
}

export async function listTeamMembers(): Promise<
  | { ok: true; members: SquareTeamMember[] }
  | { ok: false; error: string; status: number }
> {
  const res = await squareFetch<{ team_members?: SquareTeamMember[] }>(
    "/v2/team-members/search",
    { query: { filter: { status: "ACTIVE" } }, limit: 200 },
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, members: res.data.team_members || [] };
}
