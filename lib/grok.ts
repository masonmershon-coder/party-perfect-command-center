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

export async function buildAgentSystemPrompt(
  agent: Agent,
  options?: { financialAccess?: boolean },
) {
  const financialAccess = options?.financialAccess === true;
  const lines = [
    `You are ${agent.name}, an autonomous company agent.`,
    `Your primary goal: ${agent.goal}`,
    "Respond clearly, take initiative, and report progress when working on tasks.",
    "When completing work, summarize outcomes and next steps.",
  ];

  if (agent.id === MIKE_OPERATIONS_AGENT_ID) {
    lines.push(MIKE_VOICE);
    lines.push(PARTY_PERFECT_COMPANY_KNOWLEDGE);
    lines.push(GOOGLE_DOMINATION_PLAYBOOK);
    lines.push(MIKE_GOOGLE_GUIDE);
    lines.push(MIKE_ADS_AGENCY_AUDIT);
    lines.push(MIKE_GOOGLE_ADS_PLAYBOOK);
    lines.push(SALES_CHECKOUT_PLAYBOOK);
    lines.push(SALES_TICKET_COMPLETION_GUIDE);
    lines.push(SALES_PACK_AND_MINIMUM_RULES);
    lines.push(HIRING_SELECTION_PLAYBOOK);
    try {
      lines.push(
        formatHiringFeedbackForMike(await listHiringRejectFeedback()),
      );
    } catch {
      lines.push("Hiring learnings: could not load reject feedback.");
    }
    lines.push(await formatRentalsInboxForMike());
    try {
      const apps = await listJobApplications();
      lines.push(formatHiringAppsForMike(apps));
    } catch {
      lines.push("Hiring applicants: could not load job applications.");
    }
    try {
      const adsCreds = await readGoogleAdsCredentials();
      const adsStatus = publicGoogleAdsStatus(adsCreds);
      const snap = await readGoogleAdsSnapshot();
      lines.push(
        formatGoogleAdsForMike(snap, adsStatus.monthlyBudgetUsd),
        `Google Ads connect status: ${adsStatus.message}`,
      );
    } catch {
      lines.push("Google Ads: could not load credentials/snapshot.");
    }
    const snapshot = await getPorSnapshot();
    const meta = getPorSyncMeta(snapshot);
    lines.push(
      formatPorContextForAgents(snapshot, meta, {
        includeFinancials: financialAccess,
      }),
    );

    if (financialAccess) {
      lines.push(
        "Owner financial access is UNLOCKED for this message. You may answer AR, aging, payments, revenue, and rates from the POR snapshot when present. Never invent POR writes.",
      );
    } else {
      lines.push(
        "Owner financial access is LOCKED (employee session).",
        "You may discuss ops: inventory availability, deliveries, returns, tasks, email/social backlog — no dollar amounts.",
        "If the user asks about money — AR, aging, payments, revenue, sales, rates, bills, payroll, profit, or balances — do NOT invent or reveal numbers.",
        "Instead tell them clearly: switch the Command Center role to Owner and enter the admin code, then ask you again. Do not ask them to type the PIN in chat.",
      );
    }
  }

  if (agent.id === MADISON_COMMS_AGENT_ID) {
    lines.push(MADISON_VOICE);
    lines.push(PARTY_PERFECT_COMPANY_KNOWLEDGE);
    lines.push(MADISON_SOCIAL_PLAYBOOK);
    lines.push(MADISON_DESIGN_PLAYBOOK);
    lines.push(
      "Always hiring — whenever someone needs a jobs CTA use https://partyperfectjobs.com only (no Easy Apply dump).",
      "Daily growth + keep-up: prioritize live inbox replies first, then content/outreach ideas.",
      "Website for consumer ads & galleries: https://www.partyperfecteventrental.com — brand: Social Butterfly of the Event Industry.",
      "Design Studio tab is yours — coach phone uploads + Grok Imagine prompts for showroom looks.",
    );
  }

  return lines.join("\n");
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

  return grokClient.responses.create({
    model: params.model,
    input: [
      { role: "system", content: params.systemPrompt },
      ...toGrokInput(params.messages),
    ],
    stream: true,
  });
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
