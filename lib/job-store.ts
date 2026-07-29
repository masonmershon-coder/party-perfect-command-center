import {
  durableStoreMode,
  readDurableJson,
  writeDurableJson,
} from "./durable-json";
import type { JobApplication } from "./jobs";

const KEY = "job-applications.json";

/** Prefer Vercel Blob so candidates survive cold starts. */
export async function readJobApplicationsStore(): Promise<JobApplication[]> {
  const data = await readDurableJson<JobApplication[]>(KEY, []);
  return Array.isArray(data) ? data : [];
}

export async function writeJobApplicationsStore(
  applications: JobApplication[],
) {
  await writeDurableJson(KEY, applications.slice(0, 500));
}

export function jobStoreMode() {
  return durableStoreMode();
}
