import OpenAI from "openai";
import { MADISON_VOICE, MIKE_VOICE } from "./agent-voices";
import { formatHiringAppsForMike } from "./candidate-social";
import {
  formatHiringFeedbackForMike,
  listHiringRejectFeedback,
} from "./hiring-feedback";
import { HIRING_SELECTION_PLAYBOOK } from "./hiring-selection-playbook";
import { listJobApplications } from "./job-applications";
import { MADISON_SOCIAL_PLAYBOOK } from "./madison-social-playbook";
import { MADISON_DESIGN_PLAYBOOK } from "./madison-design-playbook";
import { MIKE_GOOGLE_ADS_PLAYBOOK } from "./mike-google-ads-playbook";
import { MIKE_GOOGLE_GUIDE } from "./mike-google-guide";
import { MIKE_ADS_AGENCY_AUDIT } from "./mike-ads-agency-audit";
import {
  GOOGLE_DOMINATION_PLAYBOOK,
  PARTY_PERFECT_COMPANY_KNOWLEDGE,
} from "./party-perfect-company";
import { PARTY_PERFECT_OPS_FACTS } from "./party-perfect-ops-facts";
import {
  formatGoogleAdsForMike,
  readGoogleAdsSnapshot,
} from "./google-ads";
import {
  publicGoogleAdsStatus,
  readGoogleAdsCredentials,
} from "./google-ads-credentials";
import {
  formatPorContextForAgents,
  getPorSnapshot,
  getPorSyncMeta,
} from "./por-snapshot";
import {
  getPorCrmMeta,
  resolvePorCrmContextForMessage,
  type PorCrmToolContext,
} from "./por-crm";
import { SALES_CHECKOUT_PLAYBOOK } from "./sales-checkout-playbook";
import { SALES_PACK_AND_MINIMUM_RULES } from "./sales-pack-rules";
import { SALES_TICKET_COMPLETION_GUIDE } from "./sales-ticket";
import {
  draftTicketFromWebQuoteEmail,
  formatTicketDraftForMike,
  isPrHostingWebQuoteEmail,
} from "./sales-web-quote";
import { MADISON_COMMS_AGENT_ID, MIKE_OPERATIONS_AGENT_ID } from "./seed";
import { listEmails } from "./storage";
import type { Agent, GrokModel, Message } from "./types";
import { emailPriorityOrder } from "./email-priority";

async function formatRentalsInboxForMike(): Promise<string> {
  try {
    const emails = await listEmails("company");
    const open = emails
      .filter((e) => e.status !== "archived")
      .sort((a, b) => {
        const p =
          emailPriorityOrder[a.priority] - emailPriorityOrder[b.priority];
        if (p !== 0) return p;
        return (
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        );
      })
      .slice(0, 12);

    if (open.length === 0) {
      return [
        "Rentals inbox (Command Center): no live emails loaded.",
        "If Josh expects a PR hosting / web quote (Tiffany, do-not-reply), IMAP sync may be failing — ask to fix EMAIL_COMPANY_IMAP_PASSWORD or paste the email.",
      ].join("\n");
    }

    const blocks: string[] = [
      "Rentals inbox snapshot (for quote follow-through — newest/high priority first):",
    ];

    for (const email of open) {
      blocks.push(
        [
          `— ${email.priority.toUpperCase()} | ${email.status} | ${email.receivedAt}`,
          `From: ${email.sender} <${email.senderEmail}>`,
          `Subject: ${email.subject}`,
          `Preview: ${email.preview}`,
        ].join("\n"),
      );

      if (
        isPrHostingWebQuoteEmail({
          subject: email.subject,
          sender: email.sender,
          senderEmail: email.senderEmail,
          body: email.body,
        })
      ) {
        const draft = draftTicketFromWebQuoteEmail({
          subject: email.subject,
          sender: email.sender,
          senderEmail: email.senderEmail,
          body: email.body,
        });
        blocks.push(
          "WEB/PR QUOTE DETECTED — draft ticket for showroom (import via PR web link into POR, then finish):",
          formatTicketDraftForMike(draft),
        );
      }
    }

    return blocks.join("\n\n");
  } catch {
    return "Rentals inbox: could not load emails from storage.";
  }
}

export const grokClient = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
  timeout: 3600 * 1000,
});

export function assertGrokConfigured() {
  if (!process.env.XAI_API_KEY) {
    throw new Error("XAI_API_KEY is not configured. Add it to .env.local.");
  }
}

const CHAT_MODELS = new Set<GrokModel>(["grok-4.3", "grok-build-0.1"]);

/** Env-backed primary chat model (default grok-4.3). */
export function getPreferredChatModel(): GrokModel {
  const raw = (process.env.XAI_CHAT_MODEL || "grok-4.3").trim() as GrokModel;
  return CHAT_MODELS.has(raw) ? raw : "grok-4.3";
}

/** Fallback when primary model id fails (default grok-build-0.1). */
export function getChatModelFallback(): GrokModel {
  const raw = (process.env.XAI_CHAT_MODEL_FALLBACK || "grok-build-0.1").trim() as GrokModel;
  return CHAT_MODELS.has(raw) ? raw : "grok-build-0.1";
}

/** Prefer preferred chat model for Mike/Madison; otherwise keep agent model if valid. */
export function resolveChatModel(preferred?: GrokModel): GrokModel {
  if (preferred && CHAT_MODELS.has(preferred)) return preferred;
  return getPreferredChatModel();
}

export async function buildAgentSystemPrompt(
  agent: Agent,
  options?: {
    financialAccess?: boolean;
    porCrmContext?: string;
  },
) {
  const financialAccess = options?.financialAccess === true;
  const stable: string[] = [
    `You are ${agent.name}, an autonomous company agent.`,
    `Your primary goal: ${agent.goal}`,
    "Respond clearly, take initiative, and report progress when working on tasks.",
    "When completing work, summarize outcomes and next steps.",
  ];
  const dynamic: string[] = [];

  if (agent.id === MIKE_OPERATIONS_AGENT_ID) {
    // Stable playbook block — keep first for xAI prompt-cache friendliness.
    stable.push(
      "--- STABLE PLAYBOOK (prefer cache) ---",
      MIKE_VOICE,
      PARTY_PERFECT_COMPANY_KNOWLEDGE,
      GOOGLE_DOMINATION_PLAYBOOK,
      MIKE_GOOGLE_GUIDE,
      MIKE_ADS_AGENCY_AUDIT,
      MIKE_GOOGLE_ADS_PLAYBOOK,
      SALES_CHECKOUT_PLAYBOOK,
      SALES_TICKET_COMPLETION_GUIDE,
      SALES_PACK_AND_MINIMUM_RULES,
      HIRING_SELECTION_PLAYBOOK,
      PARTY_PERFECT_OPS_FACTS,
      "--- END STABLE PLAYBOOK ---",
    );

    dynamic.push("--- DYNAMIC CONTEXT ---");
    try {
      dynamic.push(
        formatHiringFeedbackForMike(await listHiringRejectFeedback()),
      );
    } catch {
      dynamic.push("Hiring learnings: could not load reject feedback.");
    }
    dynamic.push(await formatRentalsInboxForMike());
    try {
      const apps = await listJobApplications();
      dynamic.push(formatHiringAppsForMike(apps, { quickIndexCap: 40 }));
    } catch {
      dynamic.push("Hiring applicants: could not load job applications.");
    }
    try {
      const adsCreds = await readGoogleAdsCredentials();
      const adsStatus = publicGoogleAdsStatus(adsCreds);
      const snap = await readGoogleAdsSnapshot();
      dynamic.push(
        formatGoogleAdsForMike(snap, adsStatus.monthlyBudgetUsd),
        `Google Ads connect status: ${adsStatus.message}`,
      );
    } catch {
      dynamic.push("Google Ads: could not load credentials/snapshot.");
    }
    const snapshot = await getPorSnapshot();
    const meta = getPorSyncMeta(snapshot);
    dynamic.push(
      formatPorContextForAgents(snapshot, meta, {
        includeFinancials: financialAccess,
      }),
    );

    try {
      const crmMeta = await getPorCrmMeta();
      if (crmMeta) {
        dynamic.push(
          `POR CRM mirror: synced ${crmMeta.syncedAt} (${crmMeta.source}). Counts: customers=${crmMeta.counts.customers}, contracts=${crmMeta.counts.transactions}, items=${crmMeta.counts.items}. Read-only — never invent POR writes.`,
        );
      }
    } catch {
      // ignore
    }

    dynamic.push(
      "Live POR CRM tools (results may be injected below when the user asks): por_customer_history, por_contract_balance, por_availability, lookup_inventory.",
      "CANONICAL POR METRICS: when asked items out / available / deliveries / returns / open contracts / AR, quote the exact CANONICAL POR METRICS fields — never re-sum categories or reuse numbers from earlier chat.",
      "Use injected POR CRM tool results for customer history, contract balances, and availability-by-date.",
      "Specific-item inventory: when asked how many of an item are out / available / left / free / on hand (e.g. \"how many white chairs\", \"gold chargers free on Oct 12\"), use the injected lookup_inventory JSON. Answer like \"40 total, 12 out, 28 available\". Never say \"no breakdown\" when lookup results are present.",
      "Period sales (monthly/weekly/Q1 Linens, etc.): NOT in the mirror — tell them to use POR reports. Do not invent.",
      "Applicant detail: quick-index is capped; when Josh names someone, use Hiring tab / ask for that applicant — do not invent missing PII.",
      "Customer PII is internal Command Center only — do not invent card numbers; card ciphertext is never stored.",
    );

    if (options?.porCrmContext) {
      dynamic.push(options.porCrmContext);
    }

    if (financialAccess) {
      dynamic.push(
        "Owner financial access is UNLOCKED for this message. You may answer AR, aging, payments, revenue, rates, and contract balances from POR when present. Never invent POR writes.",
      );
    } else {
      dynamic.push(
        "Owner financial access is LOCKED (employee session).",
        "You may discuss ops: inventory availability, deliveries, returns, tasks, email/social backlog — no dollar amounts.",
        "If the user asks about money — AR, aging, payments, revenue, sales, rates, bills, payroll, profit, or balances — do NOT invent or reveal numbers.",
        "Instead tell them clearly: switch the Command Center role to Owner and enter the admin code, then ask you again. Do not ask them to type the PIN in chat.",
      );
    }
  }

  if (agent.id === MADISON_COMMS_AGENT_ID) {
    stable.push(
      "--- STABLE PLAYBOOK (prefer cache) ---",
      MADISON_VOICE,
      PARTY_PERFECT_COMPANY_KNOWLEDGE,
      PARTY_PERFECT_OPS_FACTS,
      MADISON_SOCIAL_PLAYBOOK,
      MADISON_DESIGN_PLAYBOOK,
      "Always hiring — whenever someone needs a jobs CTA use https://partyperfectjobs.com only (full application).",
      "If Meta/Careers Page is not connected (madisonLive false), say so clearly and paste ready-to-post Careers captions + partyperfectjobs.com — do not pretend you published to Facebook.",
      "Daily growth + keep-up: prioritize live inbox replies first, then content/outreach ideas.",
      "Website for consumer ads & galleries: https://www.partyperfecteventrental.com — brand: Social Butterfly of the Event Industry.",
      "Design Studio tab is yours — coach phone uploads + Grok Imagine prompts for showroom looks.",
      "POR CRM: you may use availability and non-dollar contract/customer status from injected tool results. Never reveal balances, rates, or payment amounts.",
      "Specific-item inventory: for \"how many <item> are out / available / left\" questions, use lookup_inventory with the plain item name (no SKU; date optional → today). Phrase naturally (\"40 total, 12 out, 28 available\"). Prefer that over the aggregate items-out number. Never quote dollar amounts.",
      "--- END STABLE PLAYBOOK ---",
    );
    dynamic.push("--- DYNAMIC CONTEXT ---");
    try {
      const snapshot = await getPorSnapshot();
      const meta = getPorSyncMeta(snapshot);
      dynamic.push(
        formatPorContextForAgents(snapshot, meta, {
          includeFinancials: false,
        }),
      );
    } catch {
      dynamic.push("POR snapshot: unavailable.");
    }
    if (options?.porCrmContext) {
      dynamic.push(options.porCrmContext);
    }
  }

  return [...stable, ...dynamic].join("\n");
}

/** Resolve live POR CRM context for Mike/Madison from the user message. */
export async function buildPorCrmContextForAgent(
  agentId: string,
  message: string,
  financialAccess: boolean,
): Promise<string> {
  if (
    agentId !== MIKE_OPERATIONS_AGENT_ID &&
    agentId !== MADISON_COMMS_AGENT_ID
  ) {
    return "";
  }
  const ctx: PorCrmToolContext = {
    financialAccess,
    agent: agentId === MIKE_OPERATIONS_AGENT_ID ? "mike" : "madison",
  };
  try {
    return await resolvePorCrmContextForMessage(message, ctx);
  } catch {
    return "";
  }
}

export function toGrokInput(messages: Pick<Message, "role" | "content">[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export async function streamGrokResponse(params: {
  model: GrokModel;
  systemPrompt: string;
  messages: Pick<Message, "role" | "content">[];
}) {
  assertGrokConfigured();

  const primary = resolveChatModel(params.model);
  const fallback = getChatModelFallback();
  const input = [
    { role: "system" as const, content: params.systemPrompt },
    ...toGrokInput(params.messages),
  ];

  try {
    return await grokClient.responses.create({
      model: primary,
      input,
      stream: true,
    });
  } catch (error) {
    if (primary === fallback) throw error;
    console.warn(
      `[grok] model ${primary} failed; falling back to ${fallback}:`,
      error instanceof Error ? error.message : error,
    );
    return grokClient.responses.create({
      model: fallback,
      input,
      stream: true,
    });
  }
}

export function createTextStream(
  stream: AsyncIterable<{ type: string; delta?: string }>,
) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta" && event.delta) {
            controller.enqueue(encoder.encode(event.delta));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
