import { syncAllEmailInboxes } from "@/lib/imap-sync";
import { isBusinessPriority } from "@/lib/email-priority";
import { formatPhoneDisplay, getManagerPhone, sendSms } from "@/lib/twilio";
import { readDurableJson, writeDurableJson } from "./durable-json";

const ALERT_STATE_KEY = "mike-alert-state.json";

interface AlertState {
  alertedIds: string[];
  lastAlertAt?: string;
}

async function readAlertState(): Promise<AlertState> {
  return readDurableJson<AlertState>(ALERT_STATE_KEY, { alertedIds: [] });
}

async function writeAlertState(state: AlertState) {
  await writeDurableJson(ALERT_STATE_KEY, state);
}

/**
 * Sync inboxes and optionally SMS the manager about new high-priority mail.
 */
export async function runMikeInboxCheck(options?: {
  sendSmsAlerts?: boolean;
}) {
  const sync = await syncAllEmailInboxes();
  let sms:
    | {
        attempted: boolean;
        sent: boolean;
        error?: string;
        sid?: string;
      }
    | undefined;

  if (options?.sendSmsAlerts && sync.highPriorityNew.length > 0) {
    const state = await readAlertState();
    const alerted = new Set(state.alertedIds);
    const fresh = sync.highPriorityNew.filter(
      (email) => !alerted.has(email.id) && isBusinessPriority(email.priority),
    );

    if (fresh.length > 0) {
      const lines = fresh.slice(0, 5).map((email) => {
        const box =
          email.accountId === "company"
            ? "General"
            : email.accountId === "josh"
              ? "Josh"
              : "Michelle";
        return `• [${box}] ${email.subject.slice(0, 60)}`;
      });

      const body = [
        `Party Perfect alert — Mike: ${fresh.length} high-priority email${fresh.length === 1 ? "" : "s"}`,
        ...lines,
      ]
        .join("\n")
        .slice(0, 1500);

      try {
        const result = await sendSms({
          to: getManagerPhone(),
          body,
        });
        for (const email of fresh) alerted.add(email.id);
        await writeAlertState({
          alertedIds: Array.from(alerted).slice(-200),
          lastAlertAt: new Date().toISOString(),
        });
        sms = {
          attempted: true,
          sent: true,
          sid: result.sid,
        };
      } catch (error) {
        sms = {
          attempted: true,
          sent: false,
          error: error instanceof Error ? error.message : "SMS failed",
        };
      }
    } else {
      sms = { attempted: false, sent: false };
    }
  }

  return {
    sync,
    sms,
    managerPhoneDisplay: formatPhoneDisplay(getManagerPhone()),
  };
}
