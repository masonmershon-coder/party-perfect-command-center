import { getDurableRedis, isDurableRedisConfigured } from "@/lib/durable-json";
import type {
  PorCrmMeta,
  PorCustomerCommentRecord,
  PorCustomerRecord,
  PorItemRecord,
  PorJobSiteRecord,
  PorPaymentDetailRecord,
  PorPaymentRecord,
  PorTransactionItemRecord,
  PorTransactionRecord,
} from "./types";
import { stripPaymentCardFields, toPublicCustomer } from "./sanitize";

function custKey(cnum: string) {
  return `pp:por:cust:${cnum}`;
}
function custSitesKey(cnum: string) {
  return `pp:por:cust:${cnum}:sites`;
}
function custCommentsKey(cnum: string) {
  return `pp:por:cust:${cnum}:comments`;
}
function custTxKey(cnum: string) {
  return `pp:por:cust:${cnum}:tx`;
}
function nameIndexKey(token: string) {
  return `pp:por:cust-name:${token}`;
}
function txKey(cntr: string) {
  return `pp:por:tx:${cntr}`;
}
function txItemsKey(cntr: string) {
  return `pp:por:tx-items:${cntr}`;
}
function txPaysKey(cntr: string) {
  return `pp:por:tx:${cntr}:pays`;
}
function payKey(payment: string) {
  return `pp:por:pay:${payment}`;
}
function payDetailKey(payment: string) {
  return `pp:por:pay:${payment}:detail`;
}
function itemKey(num: string) {
  return `pp:por:item:${num}`;
}
function itemSkuKey(sku: string) {
  return `pp:por:item-sku:${sku}`;
}

export const POR_CRM_META_KEY = "pp:por:crm-meta";

export function isPorCrmStoreConfigured() {
  return isDurableRedisConfigured();
}

export function normalizeId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^0+(?=\d)/, "");
}

export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function asNum(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : undefined;
}

export function coerceCustomer(
  row: Record<string, unknown>,
): PorCustomerRecord | null {
  const cnum = normalizeId(row.cnum ?? row.CNUM ?? row.CustNumb);
  const name = String(row.name ?? row.NAME ?? "").trim();
  if (!cnum || !name) return null;
  const publicRow = toPublicCustomer(row);
  return {
    cnum,
    key: String(publicRow.key ?? publicRow.KEY ?? "").trim() || undefined,
    name,
    address: str(publicRow.address ?? publicRow.Address),
    address2: str(publicRow.address2 ?? publicRow.Address2),
    city: str(publicRow.city ?? publicRow.CITY),
    zip: str(publicRow.zip ?? publicRow.ZIP),
    phone: str(publicRow.phone ?? publicRow.Phone),
    work: str(publicRow.work ?? publicRow.WORK),
    mobile: str(publicRow.mobile ?? publicRow.MOBILE),
    email: str(publicRow.email ?? publicRow.Email),
    status: str(publicRow.status ?? publicRow.Status),
    type: str(publicRow.type ?? publicRow.Type),
    openDate: str(publicRow.openDate ?? publicRow.OpenDate),
    lastActive: str(publicRow.lastActive ?? publicRow.LastActive),
    lastContract: str(publicRow.lastContract ?? publicRow.LastContract),
    creditLimit: asNum(publicRow.creditLimit ?? publicRow.CreditLimit),
    currentBalance: asNum(publicRow.currentBalance ?? publicRow.CurrentBalance),
    highBalance: asNum(publicRow.highBalance ?? publicRow.HighBalance),
    lastPayAmount: asNum(publicRow.lastPayAmount ?? publicRow.LastPayAmount),
    lastPayDate: str(publicRow.lastPayDate ?? publicRow.LastPayDate),
    numberContracts: asNum(
      publicRow.numberContracts ?? publicRow.NumberContracts,
    ),
    salesman: str(publicRow.salesman ?? publicRow.Salesman),
    taxCode: str(publicRow.taxCode ?? publicRow.TaxCode),
    billContact: str(publicRow.billContact ?? publicRow.BillContact),
    billPhone: str(publicRow.billPhone ?? publicRow.BillPhone),
    message: str(publicRow.message ?? publicRow.Message),
  };
}

function str(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

export function coerceJobSite(
  row: Record<string, unknown>,
): PorJobSiteRecord | null {
  const cnum = normalizeId(row.cnum ?? row.Cnum ?? row.CNUM);
  if (!cnum) return null;
  return {
    number: str(row.number ?? row.Number),
    cnum,
    description: str(row.description ?? row.Description),
    contactName: str(row.contactName ?? row.ContactName),
    contactPhone: str(row.contactPhone ?? row.ContactPhone),
    siteAddress: str(row.siteAddress ?? row.SiteAddress),
    siteCity: str(row.siteCity ?? row.SiteCity),
    siteZip: str(row.siteZip ?? row.SiteZip),
    siteNotes: str(row.siteNotes ?? row.SiteNotes),
    poNumber: str(row.poNumber ?? row.PONumber),
    jobNumber: str(row.jobNumber ?? row.JobNumber),
    projectStartDate: str(row.projectStartDate ?? row.ProjectStartDate),
    projectEndDate: str(row.projectEndDate ?? row.ProjectEndDate),
    siteDeliveryInstructions: str(
      row.siteDeliveryInstructions ?? row.SiteDeliveryInstructions,
    ),
  };
}

export function coerceComment(
  row: Record<string, unknown>,
): PorCustomerCommentRecord | null {
  const cnum = normalizeId(row.cnum ?? row.CNUM);
  const comments = String(row.comments ?? row.COMMENTS1 ?? "").trim();
  if (!cnum || !comments) return null;
  return { cnum, comments };
}

export function coerceTransaction(
  row: Record<string, unknown>,
): PorTransactionRecord | null {
  const cntr = normalizeId(row.cntr ?? row.CNTR);
  const cusn = normalizeId(row.cusn ?? row.CUSN);
  if (!cntr || !cusn) return null;
  return {
    cntr,
    cusn,
    date: str(row.date ?? row.DATE),
    time: str(row.time ?? row.TIME),
    stat: str(row.stat ?? row.STAT),
    totl: asNum(row.totl ?? row.TOTL),
    paid: asNum(row.paid ?? row.PAID),
    rent: asNum(row.rent ?? row.RENT),
    sale: asNum(row.sale ?? row.SALE),
    tax: asNum(row.tax ?? row.TAX),
    dpmt: asNum(row.dpmt ?? row.DPMT),
    pymt: asNum(row.pymt ?? row.PYMT),
    deliveryDate: str(row.deliveryDate ?? row.DeliveryDate),
    pickupDate: str(row.pickupDate ?? row.PickupDate),
    eventEndDate: str(row.eventEndDate ?? row.EventEndDate),
    contact: str(row.contact ?? row.Contact),
    contactPhone: str(row.contactPhone ?? row.ContactPhone),
    deliveryAddress: str(row.deliveryAddress ?? row.DeliveryAddress),
    deliveryCity: str(row.deliveryCity ?? row.DeliveryCity),
    deliveryZip: str(row.deliveryZip ?? row.DeliveryZip),
    jobSite: str(row.jobSite ?? row.JobSite),
    deliveryNotes: str(row.deliveryNotes ?? row.DeliveryNotes),
    transactionType: str(row.transactionType ?? row.TransactionType),
    salesman: str(row.salesman ?? row.Salesman),
    completed: str(row.completed ?? row.Completed),
    billed: str(row.billed ?? row.Billed),
  };
}

export function coerceTransactionItem(
  row: Record<string, unknown>,
): PorTransactionItemRecord | null {
  const cntr = normalizeId(row.cntr ?? row.CNTR);
  const item = normalizeId(row.item ?? row.ITEM);
  if (!cntr || !item) return null;
  const qty = asNum(row.qty ?? row.QTY) ?? 0;
  return {
    cntr,
    item,
    qty,
    pric: asNum(row.pric ?? row.PRIC),
    desc: str(row.desc ?? row.Desc),
    comments: str(row.comments ?? row.Comments),
    lineNumber: asNum(row.lineNumber ?? row.LineNumber),
    outDate: str(row.outDate ?? row.OutDate),
    taxAmount: asNum(row.taxAmount ?? row.TaxAmount),
    dailyAmount: asNum(row.dailyAmount ?? row.DailyAmount),
  };
}

export function coercePayment(
  row: Record<string, unknown>,
): PorPaymentRecord | null {
  const cleaned = stripPaymentCardFields(row);
  const payment = normalizeId(cleaned.payment ?? cleaned.Payment);
  if (!payment) return null;
  return {
    payment,
    date: str(cleaned.date ?? cleaned.Date),
    type: str(cleaned.type ?? cleaned.Type),
    custNumb: normalizeId(cleaned.custNumb ?? cleaned.CustNumb) || undefined,
    amount: asNum(cleaned.amount ?? cleaned.Amount),
    meth: str(cleaned.meth ?? cleaned.Meth),
    refNo: str(cleaned.refNo ?? cleaned.RefNo),
    notes: str(cleaned.notes ?? cleaned.Notes),
    tendered: asNum(cleaned.tendered ?? cleaned.Tendered),
    transType: str(cleaned.transType ?? cleaned.TransType),
  };
}

export function coercePaymentDetail(
  row: Record<string, unknown>,
): PorPaymentDetailRecord | null {
  const payment = normalizeId(row.payment ?? row.Payment);
  const contract = normalizeId(row.contract ?? row.Contract);
  if (!payment || !contract) return null;
  return {
    payment,
    contract,
    amount: asNum(row.amount ?? row.Amount),
    discount: asNum(row.discount ?? row.Discount),
  };
}

export function coerceItem(row: Record<string, unknown>): PorItemRecord | null {
  const key = String(row.key ?? row.KEY ?? "").trim();
  const num = normalizeId(row.num ?? row.NUM);
  const name = String(row.name ?? row.Name ?? "").trim();
  if (!key || !num || !name) return null;
  return {
    key,
    num,
    name,
    loc: str(row.loc ?? row.LOC),
    qty: asNum(row.qty ?? row.QTY),
    qyot: asNum(row.qyot ?? row.QYOT),
    category: str(row.category ?? row.Category),
    type: str(row.type ?? row.TYPE),
    rate1: asNum(row.rate1 ?? row.RATE1),
    sell: asNum(row.sell ?? row.SELL),
    partNumber: str(row.partNumber ?? row.PartNumber),
  };
}

async function pipelineExec(
  ops: Array<(p: ReturnType<NonNullable<ReturnType<typeof getDurableRedis>>["pipeline"]>) => void>,
) {
  const redis = getDurableRedis();
  if (!redis) throw new Error("Redis is not configured for POR CRM.");
  const BATCH = 80;
  for (let i = 0; i < ops.length; i += BATCH) {
    const slice = ops.slice(i, i + BATCH);
    const p = redis.pipeline();
    for (const op of slice) op(p);
    await p.exec();
  }
}

export async function putCustomers(customers: PorCustomerRecord[]) {
  const redis = getDurableRedis();
  if (!redis) throw new Error("Redis is not configured for POR CRM.");
  const client = redis;
  const ops: Array<(p: ReturnType<typeof client.pipeline>) => void> = [];
  for (const c of customers) {
    const cnum = normalizeId(c.cnum);
    ops.push((p) => {
      p.set(custKey(cnum), c);
      for (const token of nameTokens(c.name)) {
        p.sadd(nameIndexKey(token), cnum);
      }
    });
  }
  await pipelineExec(ops);
}

export async function putJobSitesByCustomer(
  byCnum: Map<string, PorJobSiteRecord[]>,
) {
  const ops: Array<
    (p: ReturnType<NonNullable<ReturnType<typeof getDurableRedis>>["pipeline"]>) => void
  > = [];
  for (const [cnum, sites] of byCnum) {
    const id = normalizeId(cnum);
    ops.push((p) => p.set(custSitesKey(id), sites));
  }
  await pipelineExec(ops);
}

export async function putCommentsByCustomer(
  byCnum: Map<string, PorCustomerCommentRecord[]>,
) {
  const ops: Array<
    (p: ReturnType<NonNullable<ReturnType<typeof getDurableRedis>>["pipeline"]>) => void
  > = [];
  for (const [cnum, comments] of byCnum) {
    const id = normalizeId(cnum);
    ops.push((p) => p.set(custCommentsKey(id), comments));
  }
  await pipelineExec(ops);
}

export async function putTransactions(txs: PorTransactionRecord[]) {
  const ops: Array<
    (p: ReturnType<NonNullable<ReturnType<typeof getDurableRedis>>["pipeline"]>) => void
  > = [];
  for (const tx of txs) {
    const cntr = normalizeId(tx.cntr);
    const cusn = normalizeId(tx.cusn);
    ops.push((p) => {
      p.set(txKey(cntr), tx);
      p.sadd(custTxKey(cusn), cntr);
    });
  }
  await pipelineExec(ops);
}

export async function putTransactionItemsByCntr(
  byCntr: Map<string, PorTransactionItemRecord[]>,
) {
  const ops: Array<
    (p: ReturnType<NonNullable<ReturnType<typeof getDurableRedis>>["pipeline"]>) => void
  > = [];
  for (const [cntr, items] of byCntr) {
    const id = normalizeId(cntr);
    ops.push((p) => p.set(txItemsKey(id), items));
  }
  await pipelineExec(ops);
}

export async function putPayments(payments: PorPaymentRecord[]) {
  const ops: Array<
    (p: ReturnType<NonNullable<ReturnType<typeof getDurableRedis>>["pipeline"]>) => void
  > = [];
  for (const pay of payments) {
    const id = normalizeId(pay.payment);
    ops.push((p) => p.set(payKey(id), pay));
  }
  await pipelineExec(ops);
}

export async function putPaymentDetails(
  details: PorPaymentDetailRecord[],
  replaceByPayment = true,
) {
  const byPay = new Map<string, PorPaymentDetailRecord[]>();
  for (const d of details) {
    const pid = normalizeId(d.payment);
    const list = byPay.get(pid) || [];
    list.push(d);
    byPay.set(pid, list);
  }

  const ops: Array<
    (p: ReturnType<NonNullable<ReturnType<typeof getDurableRedis>>["pipeline"]>) => void
  > = [];
  for (const [payment, rows] of byPay) {
    ops.push((p) => {
      if (replaceByPayment) p.set(payDetailKey(payment), rows);
      for (const row of rows) {
        p.sadd(txPaysKey(normalizeId(row.contract)), payment);
      }
    });
  }
  await pipelineExec(ops);
}

export async function putItems(items: PorItemRecord[]) {
  const ops: Array<
    (p: ReturnType<NonNullable<ReturnType<typeof getDurableRedis>>["pipeline"]>) => void
  > = [];
  for (const item of items) {
    const num = normalizeId(item.num);
    const sku = item.key.trim();
    ops.push((p) => {
      p.set(itemKey(num), item);
      p.set(itemSkuKey(sku), num);
    });
  }
  await pipelineExec(ops);
}

export async function saveCrmMeta(meta: PorCrmMeta) {
  const redis = getDurableRedis();
  if (!redis) throw new Error("Redis is not configured for POR CRM.");
  await redis.set(POR_CRM_META_KEY, meta);
}

export async function getCrmMeta(): Promise<PorCrmMeta | null> {
  const redis = getDurableRedis();
  if (!redis) return null;
  const meta = await redis.get<PorCrmMeta>(POR_CRM_META_KEY);
  return meta ?? null;
}

export async function getCustomer(
  cnum: string,
): Promise<PorCustomerRecord | null> {
  const redis = getDurableRedis();
  if (!redis) return null;
  return (await redis.get<PorCustomerRecord>(custKey(normalizeId(cnum)))) ?? null;
}

export async function getCustomerSites(
  cnum: string,
): Promise<PorJobSiteRecord[]> {
  const redis = getDurableRedis();
  if (!redis) return [];
  const rows = await redis.get<PorJobSiteRecord[]>(
    custSitesKey(normalizeId(cnum)),
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getCustomerComments(
  cnum: string,
): Promise<PorCustomerCommentRecord[]> {
  const redis = getDurableRedis();
  if (!redis) return [];
  const rows = await redis.get<PorCustomerCommentRecord[]>(
    custCommentsKey(normalizeId(cnum)),
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getCustomerContractIds(cnum: string): Promise<string[]> {
  const redis = getDurableRedis();
  if (!redis) return [];
  const ids = await redis.smembers(custTxKey(normalizeId(cnum)));
  return (ids as string[]).map(normalizeId).filter(Boolean);
}

export async function getTransaction(
  cntr: string,
): Promise<PorTransactionRecord | null> {
  const redis = getDurableRedis();
  if (!redis) return null;
  return (await redis.get<PorTransactionRecord>(txKey(normalizeId(cntr)))) ?? null;
}

export async function getTransactionItems(
  cntr: string,
): Promise<PorTransactionItemRecord[]> {
  const redis = getDurableRedis();
  if (!redis) return [];
  const rows = await redis.get<PorTransactionItemRecord[]>(
    txItemsKey(normalizeId(cntr)),
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getPayment(
  payment: string,
): Promise<PorPaymentRecord | null> {
  const redis = getDurableRedis();
  if (!redis) return null;
  return (
    (await redis.get<PorPaymentRecord>(payKey(normalizeId(payment)))) ?? null
  );
}

export async function getPaymentDetails(
  payment: string,
): Promise<PorPaymentDetailRecord[]> {
  const redis = getDurableRedis();
  if (!redis) return [];
  const rows = await redis.get<PorPaymentDetailRecord[]>(
    payDetailKey(normalizeId(payment)),
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getContractPaymentIds(cntr: string): Promise<string[]> {
  const redis = getDurableRedis();
  if (!redis) return [];
  const ids = await redis.smembers(txPaysKey(normalizeId(cntr)));
  return (ids as string[]).map(normalizeId).filter(Boolean);
}

export async function getItemByNum(
  num: string,
): Promise<PorItemRecord | null> {
  const redis = getDurableRedis();
  if (!redis) return null;
  return (await redis.get<PorItemRecord>(itemKey(normalizeId(num)))) ?? null;
}

export async function getItemBySku(
  sku: string,
): Promise<PorItemRecord | null> {
  const redis = getDurableRedis();
  if (!redis) return null;
  const num = await redis.get<string>(itemSkuKey(sku.trim()));
  if (!num) return null;
  return getItemByNum(String(num));
}

export async function searchCustomerIdsByName(
  query: string,
  limit = 25,
): Promise<string[]> {
  const redis = getDurableRedis();
  if (!redis) return [];
  const tokens = nameTokens(query);
  if (!tokens.length) return [];

  const sets = await Promise.all(
    tokens.slice(0, 6).map((t) => redis.smembers(nameIndexKey(t))),
  );
  const counts = new Map<string, number>();
  for (const members of sets) {
    for (const id of members as string[]) {
      const cnum = normalizeId(id);
      counts.set(cnum, (counts.get(cnum) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([cnum]) => cnum);
}

export async function getCustomersByIds(
  cnums: string[],
): Promise<PorCustomerRecord[]> {
  const redis = getDurableRedis();
  if (!redis || !cnums.length) return [];
  const p = redis.pipeline();
  for (const c of cnums) p.get(custKey(normalizeId(c)));
  const rows = await p.exec();
  const out: PorCustomerRecord[] = [];
  for (const row of rows) {
    if (row && typeof row === "object" && "cnum" in (row as object)) {
      out.push(row as PorCustomerRecord);
    }
  }
  return out;
}

export async function getTransactionsByIds(
  cntrs: string[],
): Promise<PorTransactionRecord[]> {
  const redis = getDurableRedis();
  if (!redis || !cntrs.length) return [];
  const p = redis.pipeline();
  for (const c of cntrs) p.get(txKey(normalizeId(c)));
  const rows = await p.exec();
  const out: PorTransactionRecord[] = [];
  for (const row of rows) {
    if (row && typeof row === "object" && "cntr" in (row as object)) {
      out.push(row as PorTransactionRecord);
    }
  }
  return out;
}

export async function getPaymentsByIds(
  ids: string[],
): Promise<PorPaymentRecord[]> {
  const redis = getDurableRedis();
  if (!redis || !ids.length) return [];
  const p = redis.pipeline();
  for (const id of ids) p.get(payKey(normalizeId(id)));
  const rows = await p.exec();
  const out: PorPaymentRecord[] = [];
  for (const row of rows) {
    if (row && typeof row === "object" && "payment" in (row as object)) {
      out.push(row as PorPaymentRecord);
    }
  }
  return out;
}
