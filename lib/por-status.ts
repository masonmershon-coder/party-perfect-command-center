/**
 * Deterministic POR Transactions.STAT classification.
 * Mirror of por-sync-agent/PorStatus.ps1 — do not re-derive.
 *
 * STAT is TWO characters: char 1 = TransactionStatus, char 2 =
 * TransactionSecondaryStatus. A BLANK/SPACE primary means Completed.
 * NEVER LTRIM before reading char 1 (corrupts 54.8% of rows).
 */

export const POR_PRIMARY_STATUS: Record<string, string> = {
  " ": "Completed",
  A: "Adjustment",
  C: "Closed",
  D: "Completed",
  F: "FinanceCharge",
  O: "Open",
  Q: "Quote",
  R: "Reservation",
  W: "WorkOrder",
};

export const POR_SECONDARY_STATUS: Record<string, string> = {
  " ": "None",
  A: "Adjustment",
  B: "IroImoBilled",
  C: "Cancelled",
  D: "NonReservation",
  H: "CalledOffRent",
  I: "ReservationCashAccounting",
  J: "ReservationAccrualAccounting",
  P: "PaymentDueLetterSent",
  R: "ReviewBilling",
  S: "Subrent",
  T: "TransferOrQuoteConverted",
  W: "WorkOrder",
};

/** Char 1 of STAT with NO LTRIM. NULL/empty => space (Completed). */
export function getPorPrimaryChar(stat: string | null | undefined): string {
  if (stat == null || stat.length === 0) return " ";
  return stat.substring(0, 1).toUpperCase();
}

/** Char 2 of STAT. Missing => space (None). */
export function getPorSecondaryChar(stat: string | null | undefined): string {
  if (stat == null || stat.length < 2) return " ";
  return stat.substring(1, 1 + 1).toUpperCase();
}

export function getPorStatusClass(stat: string | null | undefined): string {
  const c = getPorPrimaryChar(stat);
  return POR_PRIMARY_STATUS[c] ?? "Unknown";
}

export function isPorCancelled(
  stat: string | null | undefined,
  cancelledColumn?: unknown,
): boolean {
  if (getPorSecondaryChar(stat) === "C") return true;
  if (cancelledColumn == null) return false;
  return String(cancelledColumn).trim().toLowerCase() === "true";
}

export function isPorArchived(archivedColumn?: unknown): boolean {
  if (archivedColumn == null) return false;
  return String(archivedColumn).trim().toLowerCase() === "true";
}

export function isPorLive(
  stat: string | null | undefined,
  archivedColumn?: unknown,
  cancelledColumn?: unknown,
): boolean {
  return !isPorArchived(archivedColumn) && !isPorCancelled(stat, cancelledColumn);
}

export type PorScope =
  | "ActiveReservations"
  | "OpenOrders"
  | "OpenQuotes"
  | "AvailabilityHolds"
  | "ActivePipeline"
  | "History";

export function inPorScope(
  scope: PorScope,
  stat: string | null | undefined,
  archivedColumn?: unknown,
  cancelledColumn?: unknown,
): boolean {
  const primary = getPorPrimaryChar(stat);
  const secondary = getPorSecondaryChar(stat);
  const live = isPorLive(stat, archivedColumn, cancelledColumn);
  switch (scope) {
    case "ActiveReservations":
      return primary === "R" && live;
    case "OpenOrders":
      return primary === "O" && live;
    case "OpenQuotes":
      return primary === "Q" && secondary !== "C" && secondary !== "T" && live;
    case "AvailabilityHolds":
      return primary === "O" && live;
    case "ActivePipeline":
      return (
        ((primary === "R" || primary === "O") && live) ||
        inPorScope("OpenQuotes", stat, archivedColumn, cancelledColumn)
      );
    case "History":
      return !isPorCancelled(stat, cancelledColumn);
    default:
      return false;
  }
}

/** Plain English for UI: "Reservation", "Quote — converted", "Closed — cancelled". */
export function formatPorStatusPlain(
  stat: string | null | undefined,
  archivedColumn?: unknown,
  cancelledColumn?: unknown,
): string {
  const primaryLabel = getPorStatusClass(stat);
  const secondary = getPorSecondaryChar(stat);
  const secondaryLabel = POR_SECONDARY_STATUS[secondary] ?? "Unknown";
  const parts = [primaryLabel === "Unknown" ? `Unknown (${getPorPrimaryChar(stat)})` : primaryLabel];
  if (secondary !== " " && secondaryLabel !== "None") {
    if (secondary === "T") parts.push("converted");
    else if (secondary === "C") parts.push("cancelled");
    else parts.push(secondaryLabel.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  }
  if (isPorArchived(archivedColumn)) parts.push("archived");
  if (isPorCancelled(stat, cancelledColumn) && secondary !== "C") {
    parts.push("cancelled");
  }
  return parts.join(" — ");
}
