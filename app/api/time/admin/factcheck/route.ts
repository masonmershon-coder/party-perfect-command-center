import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { answerFactCheck, type FactCheckQuery } from "@/lib/time/factcheck";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";

/**
 * Mason / Shelly / Michelle fact-check against imported Time records.
 * Never invents answers — store only.
 */
export async function POST(request: Request) {
  const gate = await requireTimeAdmin(request, "review");
  if (isTimeAdminError(gate)) return gate;
  let body: FactCheckQuery;
  try {
    body = (await request.json()) as FactCheckQuery;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.kind) return privateJson({ error: "kind required" }, { status: 400 });
  const result = await answerFactCheck(await getTimeStore(), body);
  return privateJson(result, { status: result.ok ? 200 : 400 });
}

export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "review");
  if (isTimeAdminError(gate)) return gate;
  return privateJson({
    usage: "POST /api/time/admin/factcheck",
    kinds: [
      "hours_in_week",
      "clock_in_on_date",
      "lunch_on_date",
      "ot_in_week",
      "late_nights",
      "who_worked_on_date",
      "open_clock_outs",
      "shift_count_year",
      "employee_day",
    ],
    note: "Answers come only from imported/synced Time store records — never invented.",
  });
}
