import { getEmailAccounts } from "./email-accounts";
import { isBusinessPriority } from "./email-priority";
import { getSocialData, listEmails } from "./storage";
import type {
  CatchUpItem,
  EmailItem,
  SocialComment,
} from "./types";

export const CATCH_UP_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000; // 6 months

function catchUpCutoff() {
  return Date.now() - CATCH_UP_LOOKBACK_MS;
}

function isWithinCatchUpWindow(isoDate: string) {
  return new Date(isoDate).getTime() >= catchUpCutoff();
}

function needsReply(status: string) {
  return status !== "replied" && status !== "archived";
}

function scoreEmail(email: EmailItem): number {
  let score = 0;
  if (email.priority === "urgent") score += 100;
  else if (email.priority === "business") score += 70;
  else if (email.priority === "general") score += 30;
  if (email.status === "unread") score += 50;
  else if (email.status === "read") score += 20;
  score += new Date(email.receivedAt).getTime() / 1_000_000_000;
  return score;
}

function scoreComment(comment: SocialComment): number {
  let score = 0;
  if (comment.status === "unread") score += 60;
  else score += 25;
  const text = `${comment.text} ${comment.author}`.toLowerCase();
  if (/\bquote|booking|wedding|corporate|urgent|call|price\b/.test(text)) {
    score += 50;
  }
  score += new Date(comment.createdAt).getTime() / 1_000_000_000;
  return score;
}

function emailToCatchUpItem(email: EmailItem): CatchUpItem {
  const account = getEmailAccounts().find((entry) => entry.id === email.accountId);
  return {
    id: email.id,
    type: "email",
    title: email.subject,
    preview: email.preview,
    source: account?.label ?? email.accountId,
    date: email.receivedAt,
    priority:
      email.priority === "urgent" || email.priority === "business"
        ? "high"
        : email.priority === "general"
          ? "medium"
          : "low",
    accountId: email.accountId,
    status: email.status,
  };
}

function commentToCatchUpItem(comment: SocialComment): CatchUpItem {
  return {
    id: comment.id,
    type: "social_comment",
    title: `${comment.author} on ${comment.platform}`,
    preview: comment.text,
    source: comment.platform === "facebook" ? "Facebook" : "Instagram",
    date: comment.createdAt,
    priority:
      comment.status === "unread" ? "high" : "medium",
    platform: comment.platform,
    status: comment.status,
  };
}

export async function gatherCatchUpItems(): Promise<CatchUpItem[]> {
  const [emails, social] = await Promise.all([
    listEmails(),
    getSocialData(),
  ]);

  const emailItems = emails
    .filter(
      (email) =>
        needsReply(email.status) && isWithinCatchUpWindow(email.receivedAt),
    )
    .map(emailToCatchUpItem);

  const commentItems = social.comments
    .filter(
      (comment) =>
        needsReply(comment.status) && isWithinCatchUpWindow(comment.createdAt),
    )
    .map(commentToCatchUpItem);

  return [...emailItems, ...commentItems].sort((a, b) => {
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    const diff = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (diff !== 0) return diff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export function buildCatchUpPrompt(items: CatchUpItem[]) {
  const emailCount = items.filter((item) => item.type === "email").length;
  const socialCount = items.filter((item) => item.type === "social_comment").length;

  return {
    emailCount,
    socialCount,
    totalCount: items.length,
    itemSummaries: items.slice(0, 20).map((item, index) => ({
      rank: index + 1,
      type: item.type,
      title: item.title,
      preview: item.preview.slice(0, 200),
      source: item.source,
      priority: item.priority,
      date: item.date,
    })),
  };
}

export function fallbackCatchUpSummary(totalCount: number, emailCount: number, socialCount: number) {
  if (totalCount === 0) {
    return "You're all caught up — no unreplied emails or social comments from the last 6 months.";
  }
  return `You have ${totalCount} outstanding item${totalCount === 1 ? "" : "s"} from the last 6 months (${emailCount} email${emailCount === 1 ? "" : "s"} across your 3 accounts, ${socialCount} Facebook/Instagram comment${socialCount === 1 ? "" : "s"}). Tackle high-priority quotes and booking inquiries first.`;
}
