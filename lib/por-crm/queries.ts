import {
  availableOn,
  checkQuoteAvailability,
  type AvailabilityLineResult,
  type ItemAvailability,
} from "@/lib/por-availability";
import { getPorCatalog } from "@/lib/por-catalog";
import { redactFinancials, toPublicCustomer } from "./sanitize";
import {
  getContractPaymentIds,
  getCrmMeta,
  getCustomer,
  getCustomerComments,
  getCustomerContractIds,
  getCustomerSites,
  getCustomersByIds,
  getItemByNum,
  getItemBySku,
  getPaymentDetails,
  getPaymentsByIds,
  getTransaction,
  getTransactionItems,
  getTransactionsByIds,
  isPorCrmStoreConfigured,
  normalizeId,
  searchCustomerIdsByName,
} from "./store";
import type {
  PorContractBalance,
  PorCrmMeta,
  PorCustomerHistory,
  PorCustomerRecord,
  PorPaymentDetailRecord,
  PorPaymentRecord,
  PorTransactionItemRecord,
  PorTransactionRecord,
} from "./types";

export function porCrmReady() {
  return isPorCrmStoreConfigured();
}

export async function getPorCrmMeta(): Promise<PorCrmMeta | null> {
  return getCrmMeta();
}

export async function searchCustomers(
  q: string,
  options?: { limit?: number; includeFinancials?: boolean },
): Promise<PorCustomerRecord[]> {
  const query = q.trim();
  if (!query) return [];

  const asId = normalizeId(query);
  if (/^\d{3,}$/.test(asId)) {
    const exact = await getCustomer(asId);
    if (exact) {
      const pub = toPublicCustomer(exact as unknown as Record<string, unknown>) as unknown as PorCustomerRecord;
      return [
        redactFinancials(pub, options?.includeFinancials === true),
      ];
    }
  }

  const ids = await searchCustomerIdsByName(query, options?.limit ?? 25);
  const rows = await getCustomersByIds(ids);
  return rows.map((c) =>
    redactFinancials(
      toPublicCustomer(c as unknown as Record<string, unknown>) as unknown as PorCustomerRecord,
      options?.includeFinancials === true,
    ),
  );
}

export async function getCustomerHistory(
  cnum: string,
  options?: { includeFinancials?: boolean; maxContracts?: number },
): Promise<PorCustomerHistory | null> {
  const id = normalizeId(cnum);
  const customer = await getCustomer(id);
  if (!customer) return null;

  const [jobSites, comments, cntrs] = await Promise.all([
    getCustomerSites(id),
    getCustomerComments(id),
    getCustomerContractIds(id),
  ]);

  const max = options?.maxContracts ?? 40;
  const sortedCntrs = [...cntrs].sort((a, b) => Number(b) - Number(a)).slice(0, max);
  const txs = await getTransactionsByIds(sortedCntrs);
  txs.sort((a, b) => Number(b.cntr) - Number(a.cntr));

  const paymentIds = new Set<string>();
  for (const tx of txs) {
    for (const pid of await getContractPaymentIds(tx.cntr)) paymentIds.add(pid);
  }
  // Also pull recent payments linked via CustNumb when available on payment rows —
  // contract-linked details are the primary source.
  const payments = await getPaymentsByIds([...paymentIds].slice(0, 50));

  const includeFinancials = options?.includeFinancials === true;
  const history: PorCustomerHistory = {
    customer: toPublicCustomer(
      customer as unknown as Record<string, unknown>,
    ) as unknown as PorCustomerRecord,
    jobSites,
    comments,
    contracts: txs.map((tx) => ({
      cntr: tx.cntr,
      date: tx.date,
      stat: tx.stat,
      totl: tx.totl,
      paid: tx.paid,
      balance:
        tx.totl != null && tx.paid != null
          ? Math.round((tx.totl - tx.paid) * 100) / 100
          : undefined,
      deliveryDate: tx.deliveryDate,
      pickupDate: tx.pickupDate,
      contact: tx.contact,
    })),
    payments,
  };

  return redactFinancials(history, includeFinancials);
}

export async function getContract(
  cntr: string,
  options?: { includeFinancials?: boolean },
): Promise<{
  transaction: PorTransactionRecord;
  items: PorTransactionItemRecord[];
  payments: PorPaymentRecord[];
  paymentDetails: PorPaymentDetailRecord[];
  customerName?: string;
  balance: PorContractBalance;
} | null> {
  const id = normalizeId(cntr);
  const transaction = await getTransaction(id);
  if (!transaction) return null;

  const [items, payIds, customer] = await Promise.all([
    getTransactionItems(id),
    getContractPaymentIds(id),
    getCustomer(transaction.cusn),
  ]);
  const payments = await getPaymentsByIds(payIds);
  const paymentDetails: PorPaymentDetailRecord[] = [];
  for (const pid of payIds) {
    const details = await getPaymentDetails(pid);
    for (const d of details) {
      if (normalizeId(d.contract) === id) paymentDetails.push(d);
    }
  }

  const totl = transaction.totl ?? 0;
  const paid = transaction.paid ?? 0;
  const paymentDetailTotal = paymentDetails.reduce(
    (sum, d) => sum + (d.amount ?? 0),
    0,
  );
  const balance: PorContractBalance = {
    cntr: id,
    cusn: transaction.cusn,
    customerName: customer?.name,
    totl,
    paid,
    balance: Math.round((totl - paid) * 100) / 100,
    paymentDetailTotal: Math.round(paymentDetailTotal * 100) / 100,
    paymentCount: payments.length,
    stat: transaction.stat,
    deliveryDate: transaction.deliveryDate,
    pickupDate: transaction.pickupDate,
  };

  const result = {
    transaction,
    items,
    payments,
    paymentDetails,
    customerName: customer?.name,
    balance,
  };
  return redactFinancials(result, options?.includeFinancials === true);
}

export async function getContractBalance(
  cntr: string,
  options?: { includeFinancials?: boolean },
): Promise<PorContractBalance | null> {
  const full = await getContract(cntr, options);
  return full?.balance ?? null;
}

export async function getCustomerBalances(
  cnum: string,
  options?: { includeFinancials?: boolean; openOnly?: boolean },
): Promise<{
  cnum: string;
  customerName?: string;
  contracts: PorContractBalance[];
  totalBalance: number;
} | null> {
  const history = await getCustomerHistory(cnum, {
    includeFinancials: true,
    maxContracts: 80,
  });
  if (!history) return null;

  const balances: PorContractBalance[] = [];
  for (const c of history.contracts) {
    const bal = (c.totl ?? 0) - (c.paid ?? 0);
    if (options?.openOnly && Math.abs(bal) < 0.01) continue;
    balances.push({
      cntr: c.cntr,
      cusn: history.customer.cnum,
      customerName: history.customer.name,
      totl: c.totl ?? 0,
      paid: c.paid ?? 0,
      balance: Math.round(bal * 100) / 100,
      paymentDetailTotal: 0,
      paymentCount: 0,
      stat: c.stat,
      deliveryDate: c.deliveryDate,
      pickupDate: c.pickupDate,
    });
  }

  const totalBalance = Math.round(
    balances.reduce((s, b) => s + b.balance, 0) * 100,
  ) / 100;

  const result = {
    cnum: history.customer.cnum,
    customerName: history.customer.name,
    contracts: balances,
    totalBalance,
  };
  return redactFinancials(result, options?.includeFinancials === true);
}

/** Resolve sku or ItemFile.NUM, then use lib/por-availability. */
export async function checkItemAvailability(
  itemKeyOrSku: string,
  dateISO: string,
): Promise<ItemAvailability & { resolvedSku?: string; resolvedNum?: string; name?: string }> {
  const raw = itemKeyOrSku.trim();
  let sku = raw;
  let num: string | undefined;
  let name: string | undefined;

  const bySku = await getItemBySku(raw);
  if (bySku) {
    sku = bySku.key;
    num = bySku.num;
    name = bySku.name;
  } else {
    const byNum = await getItemByNum(raw);
    if (byNum) {
      sku = byNum.key;
      num = byNum.num;
      name = byNum.name;
    } else {
      const { items } = await getPorCatalog();
      const cat =
        items.find((i) => i.sku === raw) ||
        items.find((i) => (i.num || "").trim() === normalizeId(raw));
      if (cat) {
        sku = cat.sku;
        num = cat.num;
        name = cat.name;
      }
    }
  }

  const avail = await availableOn(sku, dateISO);
  return { ...avail, resolvedSku: sku, resolvedNum: num, name };
}

export async function checkLinesAvailability(
  lines: Array<{ itemKey: string; qty: number }>,
  dateISO: string,
): Promise<AvailabilityLineResult[]> {
  const resolved = await Promise.all(
    lines.map(async (line) => {
      const a = await checkItemAvailability(line.itemKey, dateISO);
      return { itemKey: a.resolvedSku || line.itemKey, qty: line.qty };
    }),
  );
  return checkQuoteAvailability(resolved, dateISO);
}
