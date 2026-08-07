import type { EmailPriority } from "./types";

export const emailPriorityOrder: Record<EmailPriority, number> = {
  urgent: 0,
  business: 1,
  general: 2,
  low: 3,
};

export const emailPriorityLabels: Record<EmailPriority, string> = {
  urgent: "Urgent",
  business: "Business",
  general: "General",
  low: "Low",
};

export function isBusinessPriority(priority: EmailPriority) {
  return priority === "urgent" || priority === "business";
}

export function inferEmailPriority(subject: string, preview: string): EmailPriority {
  const text = `${subject} ${preview}`.toLowerCase();

  if (
    /\burgent\b|\basap\b|\bdeadline\b|\bimmediately\b|\btoday\b|\btime.?sensitive\b|\bprhosting\b|\bhosting\.net\b|\bdo not reply\b|\bdonotreply\b|\bweb quote\b/.test(
      text,
    )
  ) {
    return "urgent";
  }

  if (
    /\bquote\b|\binquiry\b|\bcontract\b|\binsurance\b|\bcoi\b|\bpayment\b|\bbooking\b|\breservation\b|\bpartnership\b|\bgala\b|\bwedding\b|\bcorporate\b|\bdelivery\b|\bvendor\b|\bticket\b|\btiffany\b/.test(
      text,
    )
  ) {
    return "business";
  }

  if (
    /\bnewsletter\b|\binstagram\b|\bmagazine\b|\bfeature request\b|\bpromo\b/.test(
      text,
    )
  ) {
    return "low";
  }

  return "general";
}

export function compareEmailsByPriority(
  a: { priority: EmailPriority; receivedAt: string },
  b: { priority: EmailPriority; receivedAt: string },
) {
  const priorityDiff =
    emailPriorityOrder[a.priority] - emailPriorityOrder[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
}
