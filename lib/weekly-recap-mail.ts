import nodemailer from "nodemailer";
import { appUrl } from "@/lib/app-url";
import {
  generateWeeklyRecapEmailBody,
  generateWeeklyRecapMessage,
} from "@/lib/weekly-recap";

function smtpConfigured() {
  const host = process.env.SMTP_HOST?.trim();
  const user =
    process.env.SMTP_USER?.trim() ||
    process.env.EMAIL_COMPANY_ADDRESS?.trim();
  const pass =
    process.env.SMTP_PASS?.trim() ||
    process.env.EMAIL_COMPANY_IMAP_PASSWORD?.trim();
  return Boolean(host && user && pass);
}

/** Josh ops inbox — Monday weekly recap destination. */
export function weeklyRecapEmailRecipients(): string[] {
  const configured = process.env.WEEKLY_RECAP_EMAIL_TO?.trim();
  if (configured) {
    return [
      ...new Set(
        configured
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
      ),
    ];
  }
  return [
    process.env.EMAIL_JOSH_ADDRESS?.trim() || "info@mershonevents.com",
  ];
}

/**
 * Email the weekly ops recap (longer than SMS). Default To: info@mershonevents.com.
 */
export async function sendWeeklyRecapEmail(options?: {
  /** Optional pre-built bodies; otherwise generated. */
  emailBody?: string;
  smsBody?: string;
}): Promise<{ sent: boolean; to: string[]; error?: string }> {
  const to = weeklyRecapEmailRecipients();
  if (!smtpConfigured()) {
    return {
      sent: false,
      to,
      error:
        "SMTP not configured (SMTP_HOST + SMTP_USER/EMAIL_COMPANY + SMTP_PASS/EMAIL_COMPANY_IMAP_PASSWORD).",
    };
  }
  if (to.length === 0) {
    return { sent: false, to, error: "No weekly recap email recipients." };
  }

  const emailBody =
    options?.emailBody?.trim() || (await generateWeeklyRecapEmailBody());
  const smsBody =
    options?.smsBody?.trim() || (await generateWeeklyRecapMessage());

  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "465");
  const user = (
    process.env.SMTP_USER?.trim() ||
    process.env.EMAIL_COMPANY_ADDRESS?.trim() ||
    ""
  ).trim();
  const pass = (
    process.env.SMTP_PASS?.trim() ||
    process.env.EMAIL_COMPANY_IMAP_PASSWORD?.trim() ||
    ""
  ).trim();
  const from =
    process.env.SMTP_FROM?.trim() ||
    `Mike · Party Perfect Ops <${user}>`;

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date());

  const text = [
    emailBody,
    "",
    "—",
    `SMS-length version: ${smsBody}`,
    "",
    `Open Command Center: ${appUrl("/?section=reports")}`,
    "Mike · Operations Manager",
  ].join("\n");

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject: `Party Perfect weekly recap — ${dateLabel}`,
      text,
    });

    return { sent: true, to };
  } catch (error) {
    return {
      sent: false,
      to,
      error: error instanceof Error ? error.message : "Email send failed",
    };
  }
}
