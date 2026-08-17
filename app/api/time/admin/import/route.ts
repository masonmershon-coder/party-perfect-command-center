import { isAuthError, privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { requireTimekeepingAdmin } from "@/lib/time/http";
import { importSquareCsv } from "@/lib/time/square-import";

export async function GET() {
  const gate = await requireTimekeepingAdmin();
  if (isAuthError(gate)) return gate;
  return privateJson({ runs: await (await getTimeStore()).listImportRuns() });
}

export async function POST(request: Request) {
  const gate = await requireTimekeepingAdmin();
  if (isAuthError(gate)) return gate;
  const contentType = request.headers.get("content-type") || "";
  let csv = "";
  let fileName = "square.csv";
  let commit = false;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    commit = String(form.get("commit") || "") === "true";
    if (file && typeof file === "object" && "text" in file) {
      csv = await (file as File).text();
      fileName = (file as File).name || fileName;
    }
  } else {
    let body: { csv?: string; fileName?: string; commit?: boolean } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return privateJson({ error: "Invalid JSON" }, { status: 400 });
    }
    csv = String(body.csv || "");
    fileName = body.fileName || fileName;
    commit = Boolean(body.commit);
  }
  if (!csv.trim()) return privateJson({ error: "CSV required" }, { status: 400 });
  const result = await importSquareCsv(await getTimeStore(), csv, {
    fileName,
    commit,
    actor: gate.role,
  });
  return privateJson(result);
}
