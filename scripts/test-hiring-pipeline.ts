/**
 * Synthetic hiring pipeline: apply intake → store coerce → Mike score → CC/Mike views.
 * Fake PII only. Does not write Redis or send SMS/email.
 * Run: npx tsx scripts/test-hiring-pipeline.ts
 */
import { formatHiringAppsForMike } from "../lib/candidate-social";
import {
  buildJobApplicationInputFromBody,
  resolveApplyMode,
  type ApplyBody,
} from "../lib/job-apply-intake";
import {
  findRecentDuplicate,
  validateJobApplicationInput,
} from "../lib/job-apply-validate";
import { normalizeJobLeadSource } from "../lib/job-lead-sources";
import { buildJobPostingJsonLd } from "../lib/job-postings-schema";
import { coerceApplication } from "../lib/job-store";
import {
  heuristicMikeReview,
  type JobApplication,
  type JobApplicationInput,
} from "../lib/jobs";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const SYNTHETIC_BODY: ApplyBody = {
  applyMode: "full" as const,
  roles: ["tents", "delivery"] as ("tents" | "delivery")[],
  fullName: "Test Applicant Cursor Pipeline",
  phone: "(918) 555-0199",
  email: "test.pipeline.cursor.qa@example.com",
  city: "Broken Arrow",
  source: "Indeed",
  eligibleToWork: "yes" as const,
  over18: "yes" as const,
  validDriverLicense: "yes" as const,
  highSchoolGraduated: "yes" as const,
  collegeStatus: "none" as const,
  referralSource: "indeed" as const,
  hasReliableTransport: "yes" as const,
  physicalOutdoorOk: "yes" as const,
  earliestStartDate: "2026-08-20",
  daysMissedLast3Months: "0" as const,
  availabilitySlots: ["weekday_am", "early_am"],
  availability: "",
  physicalAbility: "Comfortable lifting 50+ lbs outdoors.",
  physicalStory:
    "I loaded tents onto trucks all summer in July heat and kept pace with the crew.",
  whyPartyPerfect:
    "I want to work outside with a Tulsa event crew that actually builds the party.",
  experience: "Warehouse loader, two summers.",
  workHistory: [
    {
      employer: "Example Warehouse LLC",
      roleTitle: "Loader",
      startDate: "06/2024",
      endDate: "Present",
      startPay: "$16/hr",
      endPay: "$17/hr",
      stillEmployed: true,
    },
  ],
};

const input = buildJobApplicationInputFromBody(SYNTHETIC_BODY);
assert(validateJobApplicationInput(input, { mode: "full" }) === null, "full intake validates");
assert(input.roles.includes("tents") && input.roles.includes("delivery"), "role interest survives");
assert(input.source === "indeed", `source attribution (${input.source})`);
assert(input.availability.includes("weekday"), `availability label (${input.availability})`);
assert(input.workHistory[0]?.employer === "Example Warehouse LLC", "work history survives");
assert(input.physicalStory.length >= 25, "physical story survives");
assert(input.whyPartyPerfect.length >= 40, "why PP survives");
assert(input.hasReliableTransport === "yes", "transport survives");
assert(input.email === "test.pipeline.cursor.qa@example.com", "email normalized");

const quick = resolveApplyMode({ applyMode: "quick", roles: ["tents"] });
assert(
  Boolean(quick.error && /quick apply/i.test(quick.error)),
  "Quick Apply mode rejected at intake",
);

const mike = heuristicMikeReview(input);
assert(mike.score >= 50 && mike.primaryFit.length > 0, `Mike heuristic completes (${mike.score} ${mike.primaryFit})`);
assert(mike.scoredBy === "heuristic", "heuristic scoredBy set");

const stored: JobApplication = {
  ...input,
  id: "test-pipeline-001",
  submittedAt: new Date().toISOString(),
  source: normalizeJobLeadSource(input.source),
  mike: {
    ...mike,
    fallbackReason: "Grok scoring unavailable — heuristic used",
  },
};

const roundTrip = coerceApplication(JSON.parse(JSON.stringify(stored)));
assert(roundTrip?.id === stored.id, "store coerce keeps id");
assert(roundTrip?.source === "indeed", "store coerce keeps source");
assert(roundTrip?.workHistory[0]?.startPay === "$16/hr", "store coerce keeps work history pay");
assert(roundTrip?.mike.score === stored.mike.score, "store coerce keeps Mike score");
assert(
  roundTrip?.mike.fallbackReason?.includes("heuristic"),
  "failed processing visible after coerce",
);
assert(roundTrip?.roles.includes("delivery"), "store coerce keeps roles");

const ownerRecord = {
  total: 1,
  flaggedForJosh: stored.mike.flagForJosh ? 1 : 0,
  applications: [roundTrip],
};
assert(ownerRecord.applications[0]?.fullName === stored.fullName, "owner-visible name");
assert(ownerRecord.applications[0]?.phone.replace(/\D/g, "").endsWith("5550199"), "owner-visible phone");
assert(ownerRecord.applications[0]?.mike.primaryFit, "owner-visible Mike fit");

const mikeBrief = formatHiringAppsForMike([stored]);
assert(/Test Applicant Cursor Pipeline/.test(mikeBrief), "Mike brief includes name");
assert(/source: indeed/.test(mikeBrief), "Mike brief includes source");
assert(/Example Warehouse/.test(mikeBrief), "Mike brief includes work history");
assert(/transport: yes/.test(mikeBrief), "Mike brief includes transport");
assert(/why:/.test(mikeBrief), "Mike brief includes why PP");
assert(/scoredBy: heuristic/.test(mikeBrief), "Mike brief shows scoring path");

const memory: JobApplication[] = [stored];
const dupe = findRecentDuplicate(memory, stored.phone, stored.email);
assert(dupe?.id === stored.id, "duplicate phone/email detected");
const retryWouldInsert = !findRecentDuplicate(memory, stored.phone, stored.email);
assert(!retryWouldInsert, "retry does not create a second applicant");
assert(
  !findRecentDuplicate(memory, "9185550100", "other.synthetic@example.com"),
  "different synthetic identity is not a duplicate",
);

const postings = buildJobPostingJsonLd();
assert(postings.length >= 6, `JobPosting count (${postings.length})`);
assert(
  postings.every((p) => p["@type"] === "JobPosting" && p.directApply === true),
  "each posting is JobPosting + directApply",
);
assert(
  postings.every((p) => p.baseSalary?.value?.minValue === 18),
  "JobPosting keeps $18–$28 pay band",
);
assert(
  postings.every((p) => typeof p.url === "string" && p.url.includes("src=google")),
  "JobPosting URLs carry google source + role",
);
assert(
  !JSON.stringify(postings).toLowerCase().includes("quick apply"),
  "JobPosting JSON has no Quick Apply",
);

if (process.exitCode) {
  console.error("\nhiring pipeline tests FAILED");
  process.exit(1);
}
console.log("\nhiring pipeline tests passed");
