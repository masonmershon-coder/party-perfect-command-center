import { isPorSyncConfigured } from "@/lib/por-snapshot";
import {
  coerceComment,
  coerceCustomer,
  coerceItem,
  coerceJobSite,
  coercePayment,
  coercePaymentDetail,
  coerceTransaction,
  coerceTransactionItem,
  putCommentsByCustomer,
  putCustomers,
  putItems,
  putJobSitesByCustomer,
  putPaymentDetails,
  putPayments,
  putTransactionItemsByCntr,
  putTransactions,
  saveCrmMeta,
  getCrmMeta,
} from "@/lib/por-crm";
import type { PorCrmMeta } from "@/lib/por-crm";
import {
  recordPorSyncError,
  recordPorSyncSuccess,
} from "@/lib/por-sync-health";
import {
  isAuthError,
  requireApiAuth,
} from "@/lib/api-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = process.env.POR_SYNC_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(bearer) && bearer === secret;
}

type CrmSyncBody = {
  source?: string;
  syncedAt?: string;
  replaceMeta?: boolean;
  customers?: Record<string, unknown>[];
  jobSites?: Record<string, unknown>[];
  comments?: Record<string, unknown>[];
  transactions?: Record<string, unknown>[];
  transactionItems?: Record<string, unknown>[];
  payments?: Record<string, unknown>[];
  paymentDetails?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  counts?: Partial<PorCrmMeta["counts"]>;
};

/**
 * ENTERPRISE sync: upsert POR CRM entities into Redis (keyed, not flattened).
 * Never accepts CheckCardFile or Payment Encrypted/EncryptedCard/CCAlias
 * (stripPaymentCardFields runs in coercePayment).
 *
 * Authorization: Bearer POR_SYNC_SECRET
 */
export async function POST(request: Request) {
  if (!isPorSyncConfigured()) {
    return NextResponse.json(
      { error: "POR_SYNC_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CrmSyncBody;
    const written = {
      customers: 0,
      jobSites: 0,
      comments: 0,
      transactions: 0,
      transactionItems: 0,
      payments: 0,
      paymentDetails: 0,
      items: 0,
    };

    if (Array.isArray(body.customers) && body.customers.length) {
      const rows = body.customers
        .map((r) => coerceCustomer(r))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      await putCustomers(rows);
      written.customers = rows.length;
    }

    if (Array.isArray(body.jobSites) && body.jobSites.length) {
      const by = new Map<
        string,
        NonNullable<ReturnType<typeof coerceJobSite>>[]
      >();
      for (const raw of body.jobSites) {
        const s = coerceJobSite(raw);
        if (!s) continue;
        const list = by.get(s.cnum) || [];
        list.push(s);
        by.set(s.cnum, list);
        written.jobSites++;
      }
      await putJobSitesByCustomer(by);
    }

    if (Array.isArray(body.comments) && body.comments.length) {
      const by = new Map<
        string,
        NonNullable<ReturnType<typeof coerceComment>>[]
      >();
      for (const raw of body.comments) {
        const c = coerceComment(raw);
        if (!c) continue;
        const list = by.get(c.cnum) || [];
        list.push(c);
        by.set(c.cnum, list);
        written.comments++;
      }
      await putCommentsByCustomer(by);
    }

    if (Array.isArray(body.transactions) && body.transactions.length) {
      const rows = body.transactions
        .map((r) => coerceTransaction(r))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      await putTransactions(rows);
      written.transactions = rows.length;
    }

    if (Array.isArray(body.transactionItems) && body.transactionItems.length) {
      const by = new Map<
        string,
        NonNullable<ReturnType<typeof coerceTransactionItem>>[]
      >();
      for (const raw of body.transactionItems) {
        const line = coerceTransactionItem(raw);
        if (!line) continue;
        const list = by.get(line.cntr) || [];
        list.push(line);
        by.set(line.cntr, list);
        written.transactionItems++;
      }
      await putTransactionItemsByCntr(by);
    }

    if (Array.isArray(body.payments) && body.payments.length) {
      const rows = body.payments
        .map((r) => coercePayment(r))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      await putPayments(rows);
      written.payments = rows.length;
    }

    if (Array.isArray(body.paymentDetails) && body.paymentDetails.length) {
      const rows = body.paymentDetails
        .map((r) => coercePaymentDetail(r))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      await putPaymentDetails(rows);
      written.paymentDetails = rows.length;
    }

    if (Array.isArray(body.items) && body.items.length) {
      const rows = body.items
        .map((r) => coerceItem(r))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      await putItems(rows);
      written.items = rows.length;
    }

    const prev = await getCrmMeta();
    const syncedAt = body.syncedAt || new Date().toISOString();
    const meta: PorCrmMeta = {
      syncedAt,
      source: body.source || "ENTERPRISE Sync-PorSnapshot CRM",
      counts: {
        customers: body.counts?.customers ?? prev?.counts.customers ?? written.customers,
        jobSites: body.counts?.jobSites ?? prev?.counts.jobSites ?? written.jobSites,
        comments: body.counts?.comments ?? prev?.counts.comments ?? written.comments,
        transactions:
          body.counts?.transactions ??
          prev?.counts.transactions ??
          written.transactions,
        transactionItems:
          body.counts?.transactionItems ??
          prev?.counts.transactionItems ??
          written.transactionItems,
        payments: body.counts?.payments ?? prev?.counts.payments ?? written.payments,
        paymentDetails:
          body.counts?.paymentDetails ??
          prev?.counts.paymentDetails ??
          written.paymentDetails,
        items: body.counts?.items ?? prev?.counts.items ?? written.items,
      },
    };
    await saveCrmMeta(meta);
    await recordPorSyncSuccess("crm");

    return NextResponse.json({ ok: true, written, meta });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to store CRM sync.";
    await recordPorSyncError("crm", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const gate = await requireApiAuth("por");
  if (isAuthError(gate)) return gate;

  const meta = await getCrmMeta();
  return NextResponse.json({
    configured: isPorSyncConfigured(),
    meta,
  });
}
