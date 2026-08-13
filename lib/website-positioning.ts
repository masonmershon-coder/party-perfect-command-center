/**
 * Customer-site positioning: Party Perfect is a full-service event rental
 * company — not a wedding/event planning company. Source of truth for
 * /get-quote + ASP copy patches. Do not invent rates or inventory here.
 */

import { JOBS_ORG } from "@/lib/job-postings-schema";

export const CUSTOMER_SITE_URL = "https://www.partyperfecteventrental.com";
export const CATALOG_URL = `${CUSTOMER_SITE_URL}/equipment.asp`;
export const CONTACT_URL = `${CUSTOMER_SITE_URL}/contact-us.asp`;
export const CAREERS_URL = "https://partyperfectjobs.com/";
export const GET_QUOTE_URL = "https://partyperfect.app/get-quote";
export const SHOWROOM_PHONE_DISPLAY = "918-258-7368";
export const SHOWROOM_PHONE_TEL = "+19182587368";
export const SHOWROOM_EMAIL = "Rentals@partyperfecteventrental.com";

/** One-line positioning Mike + public pages must use. */
export const RENTAL_POSITIONING_LINE =
  "Party Perfect is a full-service event rental company in Tulsa — tents, linens, tables and chairs, china, glassware, dance floors, and décor. We are not a wedding or event planning company.";

export const HOMEPAGE_H1 =
  "Full-Service Event Rentals — Tulsa & Northeastern Oklahoma";

export const HOMEPAGE_H2 =
  "Full-service event rental including wedding tents, linens, china, glassware, flatware, event décor, event furniture, dance floors, and more.";

export const HOMEPAGE_BODY = `Party Perfect Event Rental is Oklahoma’s premier full-service event rental company for weddings, corporate events, productions, and celebrations locally and nearby. We have been leading the event rental industry for decades, offering the highest quality products, outstanding customer service, and the most up-to-date trends. See our gallery for just how Oklahoma’s top wedding and event planners, caterers, florists, and photographers have used our products. You will truly be inspired!

Visit our boutique-style showroom and shop for your special event today. Rental specialists are on staff daily to help you choose inventory and style your look. No appointment needed!`;

export const ABOUT_BODY = `Party Perfect Event Rental is Tulsa’s full-service event rental company, known for specialty table linens, chair covers, tents, china, glassware, and décor. Owners Josh and Michelle Mershon have been in the event industry since 1997. This design-minded duo acquired Party Perfect in 2007, bringing to your table their enormous collection of event linens, props, and a keen eye for up-and-coming trends. Party Perfect was THE FIRST party rental company in the Tulsa area and with the Mershons’ touch, a little TLC, an up-do, and a large splash of STYLE, Party Perfect has evolved into what it is today — a trend-setting, innovative, unique event rental boutique like no other! Party Perfect is a full-service rental company dedicated to style, professionalism, and customer care. This Tulsa-based company provides rentals to Northeastern Oklahoma and surrounding areas as well as nationwide linen rentals for functions of all sizes and budgets.

From lavish weddings and large-scale banquets to small-scale and intimate functions, Party Perfect offers an extensive inventory of fashion-forward and traditional décor. Trusted by discriminating brides and local event planners to clientele such as TV networks, production and movie sets, NFL clients, and celebrities. Visit the Party Perfect showroom and let a rental specialist help you make your next event Picture Perfect!

We are a rental company. Planners, caterers, florists, and venues are welcome partners — we do not replace your wedding or event planner.`;

export const DESIGN_SUPPORT_H1 = "Rental Styling & Design Support in Tulsa OK";

export const DESIGN_SUPPORT_BODY = `Party Perfect Event Rental is a full-service event rental company. Showroom specialists help you choose and style inventory — linens, tablescapes, tents, china, glassware, dance floors, and décor — so your event looks cohesive.

We are not a wedding planner or event planning company. We do not run vendor timelines, day-of coordination, or full event production as a planning firm. Already have a planner or designer? Perfect — we work with them on rentals.

Need a tent or large outdoor event? Start a tent / large-event consultation and a rental specialist will help you scope inventory. Call to visit the showroom (no appointment needed) or request help online.

Our Party Perfect showroom team is waiting.`;

export const EMPTY_QUOTE_HEADING =
  "No rental items are on your quote yet — here’s how to continue";

export const EMPTY_QUOTE_INTRO =
  "If you already picked inventory and this page is empty, your catalog session may have timed out. You can browse the rental catalog again, start a quote without a cart, request help, or begin a tent / large-event consultation. Showroom specialists quote from live Point of Rental inventory — we do not invent rates online.";

export type EmptyQuoteChoiceId =
  | "browse"
  | "quote"
  | "help"
  | "tent";

export const EMPTY_QUOTE_CHOICES: Array<{
  id: EmptyQuoteChoiceId;
  title: string;
  description: string;
  href: string;
}> = [
  {
    id: "browse",
    title: "Browse inventory",
    description:
      "Open the Party Perfect rental catalog — tents, linens, tables, chairs, china, glassware, décor, and more.",
    href: CATALOG_URL,
  },
  {
    id: "quote",
    title: "Start a quote",
    description:
      "Tell us the event date, guest count, and what you need. Showroom builds the official quote from live inventory.",
    href: `${GET_QUOTE_URL}?intent=quote`,
  },
  {
    id: "help",
    title: "Request help",
    description:
      "Call the showroom or send a short note. Rental specialists are on staff daily — no appointment needed.",
    href: `${GET_QUOTE_URL}?intent=help`,
  },
  {
    id: "tent",
    title: "Start a tent / large-event consultation",
    description:
      "Tents, flooring, climate, and large outdoor events need a specialist. Share the date and venue and we’ll follow up.",
    href: `${GET_QUOTE_URL}?intent=tent`,
  },
];

const PLANNER_COMPANY_RE =
  /\b(wedding\s*\/?\s*event\s+planning\s+company|event\s+planning\s+company|rental\s+planners|planning\/production\s+company|design\/planning\s+duo|we\s+plan,\s*design\s+and\s+produce|planning\s+company)\b/i;

/**
 * True when copy still presents PP as a planning company.
 * Negated sentences (“we are not an event planning company”) are allowed.
 * B2B mentions of “event planners” as customers are not this pattern.
 */
export function containsPlannerCompanyLanguage(text: string): boolean {
  const chunks = text.split(/(?<=[.!?])\s+|\n+/);
  return chunks.some((chunk) => {
    if (!PLANNER_COMPANY_RE.test(chunk)) return false;
    if (/\b(not|never|don't|do not|aren't|are not)\b/i.test(chunk)) return false;
    return true;
  });
}

export function buildRentalBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: JOBS_ORG.name,
    legalName: JOBS_ORG.legalName,
    url: CUSTOMER_SITE_URL,
    image: JOBS_ORG.logo,
    telephone: JOBS_ORG.telephone,
    email: SHOWROOM_EMAIL,
    description: RENTAL_POSITIONING_LINE,
    additionalType: "https://schema.org/Store",
    address: {
      "@type": "PostalAddress",
      streetAddress: JOBS_ORG.streetAddress,
      addressLocality: JOBS_ORG.addressLocality,
      addressRegion: JOBS_ORG.addressRegion,
      postalCode: JOBS_ORG.postalCode,
      addressCountry: JOBS_ORG.addressCountry,
    },
    openingHours: ["Mo-Fr 09:00-16:00", "Sa 09:00-14:00"],
    sameAs: [
      CUSTOMER_SITE_URL,
      CAREERS_URL,
      "https://partyperfect.app/get-quote",
    ],
    makesOffer: {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Event rentals",
        description:
          "Full-service event rental: tents, linens, tables and chairs, china, glassware, dance floors, and décor. Showroom quotes from live inventory.",
      },
    },
  };
}
