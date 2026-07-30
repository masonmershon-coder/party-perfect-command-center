import nodemailer from "nodemailer";
import { roleLabel, type JobApplication } from "./jobs";

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

function backupRecipients(): string[] {
  const configured = process.env.JOB_APPLICATION_BACKUP_TO?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  const defaults = [
    process.env.EMAIL_JOSH_ADDRESS?.trim() || "info@mershonevents.com",
    process.env.EMAIL_COMPANY_ADDRESS?.trim() ||
      "Rentals@partyperfecteventrental.com",
  ];
  return [...new Set(defaults.filter(Boolean))];
}

function formatApplicationText(app: JobApplication) {
  const roles = app.roles.map(roleLabel).join(", ");
  const history = app.workHistory
    .map((row, index) => {
      const dates = row.stillEmployed
        ? `${row.startDate} – present`
        : `${row.startDate} – ${row.endDate}`;
      return [
        `  ${index + 1}. ${row.employer} — ${row.roleTitle || "(role)"}`,
        `     ${dates}`,
        `     Pay: ${row.startPay} → ${row.endPay}`,
      ].join("\n");
    })
    .join("\n");

  return [
    `New Party Perfect job application`,
    `Source: ${app.source}`,
    `Submitted: ${app.submittedAt}`,
    `ID: ${app.id}`,
    ``,
    `Name: ${app.fullName}`,
    `Phone: ${app.phone}`,
    `Email: ${app.email}`,
    `City: ${app.city}`,
    `Roles: ${roles}`,
    `Driver license: ${app.validDriverLicense}`,
    `Eligible to work: ${app.eligibleToWork}`,
    `Over 18: ${app.over18}`,
    ``,
    `Mike score: ${app.mike.score}${app.mike.flagForJosh ? " · FLAGGED for Josh" : ""}`,
    `Primary fit: ${app.mike.primaryFit}`,
    `Secondary: ${app.mike.secondaryFits.join(", ") || "—"}`,
    `Summary: ${app.mike.summary}`,
    `Strengths: ${app.mike.strengths.join("; ") || "—"}`,
    ``,
    `Availability:`,
    app.availability,
    ``,
    `Physical ability:`,
    app.physicalAbility,
    ``,
    `Why Party Perfect:`,
    app.whyPartyPerfect,
    ``,
    `Experience:`,
    app.experience || "—",
    ``,
    `Work history:`,
    history || "—",
    ``,
    app.videoUrl ? `Video: ${app.videoUrl}` : null,
    ``,
    `Review in Command Center → Hiring`,
    `https://partyperfectcomand.app/?section=hiring`,
  ]
    .filter((line) => line != null)
    .join("\n");
}

/**
 * Backup copy of every application to Josh + Rentals (or JOB_APPLICATION_BACKUP_TO).
 * Uses SMTP (GoDaddy smtpout) — does not fail the applicant if mail fails.
 */
export async function sendApplicationBackupEmail(
  application: JobApplication,
): Promise<{ sent: boolean; error?: string }> {
  if (!smtpConfigured()) {
    return {
      sent: false,
      error:
        "SMTP not configured (SMTP_HOST + SMTP_USER/EMAIL_COMPANY + SMTP_PASS/EMAIL_COMPANY_IMAP_PASSWORD).",
    };
  }

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
    `Party Perfect Hiring <${user}>`;
  const to = backupRecipients();

  if (to.length === 0) {
    return { sent: false, error: "No backup email recipients configured." };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const flag = application.mike.flagForJosh ? " · TOP CANDIDATE" : "";
    await transporter.sendMail({
      from,
      to: to.join(", "),
      subject: `[Hiring${flag}] ${application.fullName} · score ${application.mike.score}`,
      text: formatApplicationText(application),
    });

    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[jobs] Application backup email failed:", message);
    return { sent: false, error: message };
  }
}

export function isApplicationBackupEmailConfigured() {
  return smtpConfigured() && backupRecipients().length > 0;
}
