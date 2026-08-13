/**
 * Guard: full jobs application required; Quick Apply rejected.
 * Fake PII only. Run: npx tsx scripts/test-job-apply-validate.ts
 */
import { heuristicMikeReview, type JobApplicationInput } from "../lib/jobs";
import { validateJobApplicationInput } from "../lib/job-apply-validate";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const contactOnly: JobApplicationInput = {
  roles: ["tents"],
  fullName: "Test Applicant Cursor QA",
  phone: "9185550100",
  email: "test.applicant.cursor.qa@example.com",
  city: "Tulsa",
  applyMode: "full",
  eligibleToWork: "",
  over18: "",
  validDriverLicense: "",
  highSchoolGraduated: "",
  collegeStatus: "",
  referralSource: "",
  hasReliableTransport: "",
  physicalOutdoorOk: "",
  earliestStartDate: "",
  daysMissedLast3Months: "",
  availabilitySlots: [],
  availability: "",
  physicalAbility: "",
  physicalStory: "",
  whyPartyPerfect: "",
  experience: "",
  workHistory: [],
};

const full: JobApplicationInput = {
  ...contactOnly,
  eligibleToWork: "yes",
  over18: "yes",
  validDriverLicense: "yes",
  highSchoolGraduated: "yes",
  collegeStatus: "none",
  referralSource: "indeed",
  hasReliableTransport: "yes",
  physicalOutdoorOk: "yes",
  earliestStartDate: "2026-08-18",
  daysMissedLast3Months: "0",
  availabilitySlots: ["weekday_am", "early_am"],
  availability: "weekday mornings, early mornings",
  physicalAbility: "Comfortable lifting 50+ lbs, standing, outdoor heat.",
  physicalStory:
    "Last summer I loaded rental tents and tables onto trucks in July heat and kept pace with the crew.",
  whyPartyPerfect:
    "I want to work outside with a Tulsa event crew that actually builds the party, not sit at a desk.",
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

assert(
  validateJobApplicationInput(contactOnly, { mode: "quick" })?.includes(
    "Quick Apply",
  ),
  "quick mode is rejected",
);

const thinErr = validateJobApplicationInput(contactOnly, { mode: "full" });
assert(thinErr !== null, `name/phone/email-only full app is rejected (${thinErr})`);

assert(
  validateJobApplicationInput(full, { mode: "full" }) === null,
  "complete full application is accepted",
);

const mike = heuristicMikeReview(full);
assert(mike.score >= 60, `Mike heuristic scores a complete app (${mike.score})`);
assert(Boolean(mike.primaryFit), `Mike returns a department fit (${mike.primaryFit})`);
assert(
  mike.strengths.some((s) => /transport/i.test(s)),
  `Mike sees transport signal (${mike.strengths.join("; ")})`,
);
assert(
  full.workHistory.length >= 1 &&
    full.physicalStory.length >= 25 &&
    full.whyPartyPerfect.length >= 40 &&
    full.hasReliableTransport === "yes",
  "accepted payload still carries work history, physical story, why, transport for Mike/CC",
);

if (process.exitCode) {
  console.error("\njob-apply-validate tests FAILED");
  process.exit(1);
}
console.log("\njob-apply-validate tests passed");
