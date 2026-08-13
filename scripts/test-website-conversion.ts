/**
 * Customer website conversion cleanup — positioning, empty-quote choices,
 * careers link, inquiry validation (no rates). Synthetic only.
 * Run: npx tsx scripts/test-website-conversion.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  ABOUT_BODY,
  CAREERS_URL,
  CATALOG_URL,
  DESIGN_SUPPORT_BODY,
  EMPTY_QUOTE_CHOICES,
  HOMEPAGE_BODY,
  HOMEPAGE_H1,
  HOMEPAGE_H2,
  RENTAL_POSITIONING_LINE,
  buildRentalBusinessJsonLd,
  containsPlannerCompanyLanguage,
} from "../lib/website-positioning";
import { validateWebQuoteInquiryInput } from "../lib/web-quote-inquiry";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const copyBlob = [
  HOMEPAGE_H1,
  HOMEPAGE_H2,
  HOMEPAGE_BODY,
  ABOUT_BODY,
  DESIGN_SUPPORT_BODY,
  RENTAL_POSITIONING_LINE,
  EMPTY_QUOTE_CHOICES.map((c) => `${c.title} ${c.description}`).join("\n"),
].join("\n");

assert(!containsPlannerCompanyLanguage(copyBlob), "new copy is not planner-company language");
assert(
  /full-service event rental/i.test(copyBlob),
  "new copy positions PP as full-service event rental",
);
assert(CAREERS_URL === "https://partyperfectjobs.com/", "careers URL is partyperfectjobs.com");
assert(
  EMPTY_QUOTE_CHOICES.map((c) => c.id).join(",") === "browse,quote,help,tent",
  "empty quote has browse / quote / help / tent",
);
assert(
  EMPTY_QUOTE_CHOICES.find((c) => c.id === "browse")?.href === CATALOG_URL,
  "browse inventory keeps POR-backed equipment.asp catalog",
);

const jsonLd = buildRentalBusinessJsonLd();
assert(jsonLd["@type"] === "LocalBusiness", "JSON-LD is LocalBusiness, not EventPlanner");
assert(
  !JSON.stringify(jsonLd).toLowerCase().includes("eventplanner"),
  "JSON-LD does not use EventPlanner",
);
assert(/full-service event rental/i.test(jsonLd.description), "JSON-LD description is rental");

assert(
  !validateWebQuoteInquiryInput({ intent: "quote", customerName: "A" }).ok,
  "rejects short name",
);
assert(
  !validateWebQuoteInquiryInput({
    intent: "quote",
    customerName: "Test Customer",
    phone: "918-555-0199",
    email: "not-an-email",
  }).ok,
  "rejects bad email",
);

const good = validateWebQuoteInquiryInput({
  intent: "tent",
  customerName: "Test Customer",
  phone: "(918) 555-0199",
  email: "test.quote.cursor.qa@example.com",
  eventDate: "2026-09-12",
  guestCount: "150",
  venue: "Tulsa Botanic Garden",
  fulfillment: "delivery",
  notes: "Need a tent and dance floor. Do not quote a rate.",
  unitRate: 999,
  ratePerDay: 50,
  price: 12,
});
assert(good.ok, "accepts tent consultation without rates");
if (good.ok) {
  assert(good.value.intent === "tent", "intent tent");
  assert(good.value.phone === "9185550199", "phone normalized");
  assert(!("unitRate" in good.value), "does not keep invented unitRate");
  assert(!("ratePerDay" in good.value), "does not keep invented ratePerDay");
}

const spam = validateWebQuoteInquiryInput({
  intent: "help",
  customerName: "Bot",
  phone: "9185550199",
  email: "bot@example.com",
  companyUrl: "https://spam.example",
});
assert(!spam.ok && spam.spam === true, "honeypot marked spam");

const company = readFileSync(
  join(process.cwd(), "lib/party-perfect-company.ts"),
  "utf8",
);
assert(
  /not a wedding\/event planning company/i.test(company),
  "Mike company knowledge forbids planner-company positioning",
);
assert(
  company.includes("partyperfect.app/get-quote"),
  "Mike knowledge points empty quote to /get-quote",
);
assert(
  company.includes("partyperfectjobs.com"),
  "Mike knowledge keeps careers on partyperfectjobs.com",
);

const patches = [
  "website-patches/homepage-copy.html",
  "website-patches/about-us-copy.html",
  "website-patches/event-design-services-copy.html",
  "website-patches/revieworder-empty.html",
  "website-patches/nav-careers.html",
];
for (const file of patches) {
  const html = readFileSync(join(process.cwd(), file), "utf8");
  assert(!containsPlannerCompanyLanguage(html), `${file} has no planner-company language`);
  if (file.includes("nav-careers") || file.includes("revieworder")) {
    assert(html.includes("partyperfectjobs.com"), `${file} links careers`);
  }
}

if (process.exitCode) {
  console.error("website conversion tests FAILED");
} else {
  console.log("PASS website conversion tests");
}
