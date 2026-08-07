"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import {
  buildQuoteApi,
  buildQuoteFromMatchesApi,
  checkQuoteAvailabilityApi,
  deleteSavedQuoteApi,
  fetchQuoteCandidates,
  fetchSavedQuotes,
  matchQuotePhoto,
  QuoteOverbookedError,
  saveQuoteToQueue,
  searchPorCatalogApi,
  updateSavedQuoteApi,
  type QuoteCandidateLine,
  type QuoteGuardPayload,
} from "@/lib/client-api";
import { useSpeechToText } from "@/lib/speech-to-text";
import type {
  DesignMatchedItem,
  PorCatalogItem,
  Quote,
  QuoteAvailabilityLineResult,
  QuoteCustomerEvent,
  QuoteLine,
  QuoteLineInput,
  QuoteQueueStatus,
  SavedQuote,
} from "@/lib/types";
import { formatCurrency, formatTime } from "@/lib/ui";
import { useCallback, useEffect, useState } from "react";

type CaptureMode = "type" | "photo" | "browse";
type BuilderStep = "capture" | "pick" | "customer" | "quote";
type Screen = "queue" | "builder";

type PickRow = {
  id: string;
  term: string;
  qty: number;
  /** Selected catalog sku / key — null means custom blank line */
  selectedSku: string | null;
  customName: string;
  customRate: number;
  candidates: Array<PorCatalogItem & { score: number }>;
  /** When from photo matcher */
  match?: DesignMatchedItem;
};

function emptyCustomer(): QuoteCustomerEvent {
  return {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    eventDate: "",
    eventStartTime: "",
    fulfillment: "pickup",
    deliveryAddress: "",
    locationType: "",
    venue: "",
    guestCount: "",
    themeColors: "",
    salesRep: "",
    notes: "",
  };
}

function rowId() {
  return `p_${Math.random().toString(36).slice(2, 9)}`;
}

function candidateToMatch(
  item: PorCatalogItem & { score?: number },
): DesignMatchedItem {
  return {
    key: item.sku,
    name: item.name,
    categoryName: item.category,
    porItemId: item.sku,
    porAvailable: item.available,
    porPricePerDay: item.ratePerDay,
    source: "por",
    score: item.score,
  };
}

function money(n: number) {
  return formatCurrency(n);
}

function statusLabel(s: QuoteQueueStatus) {
  if (s === "reviewed") return "Reviewed";
  if (s === "sent") return "Sent";
  return "Draft";
}

function statusClass(s: QuoteQueueStatus) {
  if (s === "sent")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
  if (s === "reviewed")
    return "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]";
  return "border-[var(--pp-border)] bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]";
}

export function QuotingSection({
  createdBy = "showroom",
}: {
  createdBy?: string;
}) {
  const [screen, setScreen] = useState<Screen>("queue");
  const [step, setStep] = useState<BuilderStep>("capture");
  const [queue, setQueue] = useState<SavedQuote[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [captureMode, setCaptureMode] = useState<CaptureMode>("type");
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [picks, setPicks] = useState<PickRow[]>([]);
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseHits, setBrowseHits] = useState<
    Array<PorCatalogItem & { score: number }>
  >([]);

  const [customer, setCustomer] = useState<QuoteCustomerEvent>(emptyCustomer());
  const [quote, setQuote] = useState<Quote | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [ticketText, setTicketText] = useState("");
  const [availability, setAvailability] = useState<{
    anyOverbooked: boolean;
    results: QuoteAvailabilityLineResult[];
  } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [guardInfo, setGuardInfo] = useState<QuoteGuardPayload | null>(null);

  const speech = useSpeechToText({
    continuous: true,
    onFinalTranscript: (text) => {
      setCommand((prev) => (prev ? `${prev}, ${text}` : text));
    },
  });

  const refreshQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      setQueue(await fetchSavedQuotes());
    } catch (err) {
      setQueueError((err as Error).message);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  function resetBuilder() {
    setEditingId(null);
    setStep("capture");
    setCaptureMode("type");
    setCommand("");
    setPicks([]);
    setBrowseQuery("");
    setBrowseHits([]);
    setCustomer(emptyCustomer());
    setQuote(null);
    setEmailDraft("");
    setTicketText("");
    setAvailability(null);
    setError(null);
    setSaveMsg(null);
    setGuardInfo(null);
    setBusy(false);
  }

  function startNew() {
    resetBuilder();
    setScreen("builder");
  }

  function openSaved(row: SavedQuote) {
    setEditingId(row.id);
    setCustomer({ ...emptyCustomer(), ...row.customer });
    setQuote(row.quote);
    setEmailDraft(row.emailDraft);
    setTicketText(row.ticketText);
    setPicks([]);
    setAvailability(null);
    setError(null);
    setSaveMsg(null);
    setGuardInfo(null);
    setStep("quote");
    setScreen("builder");
  }

  async function runCandidates() {
    if (!command.trim()) {
      setError("Type or dictate the items first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { lines } = await fetchQuoteCandidates(command.trim(), 3);
      setPicks(linesToPicks(lines));
      setStep("pick");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function linesToPicks(lines: QuoteCandidateLine[]): PickRow[] {
    return lines.map((line) => ({
      id: rowId(),
      term: line.term,
      qty: line.qty,
      selectedSku: line.candidates[0]?.sku ?? null,
      customName: line.term,
      customRate: 0,
      candidates: line.candidates,
    }));
  }

  async function runPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const result = await matchQuotePhoto(
        file,
        command.trim() || undefined,
      );
      if (!result.matchedItems.length) {
        setError(
          "Madison couldn’t match inventory from that photo. Try a clearer shot or switch to Type.",
        );
        return;
      }
      setPicks(
        result.matchedItems.map((m) => ({
          id: rowId(),
          term: m.name,
          qty: 1,
          selectedSku: m.porItemId || m.key,
          customName: m.name,
          customRate: m.porPricePerDay ?? 0,
          candidates: [],
          match: m,
        })),
      );
      setStep("pick");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runBrowseSearch() {
    if (!browseQuery.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { items } = await searchPorCatalogApi(browseQuery.trim(), 10);
      setBrowseHits(items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addBrowseItem(item: PorCatalogItem & { score: number }) {
    setPicks((prev) => [
      ...prev,
      {
        id: rowId(),
        term: item.name,
        qty: 1,
        selectedSku: item.sku,
        customName: item.name,
        customRate: item.ratePerDay,
        candidates: [item],
      },
    ]);
  }

  function addBlankPick() {
    setPicks((prev) => [
      ...prev,
      {
        id: rowId(),
        term: "custom",
        qty: 1,
        selectedSku: null,
        customName: "",
        customRate: 0,
        candidates: [],
      },
    ]);
  }

  function updatePick(id: string, patch: Partial<PickRow>) {
    setPicks((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function removePick(id: string) {
    setPicks((prev) => prev.filter((row) => row.id !== id));
  }

  function picksToMatchesAndQty(): {
    matches: DesignMatchedItem[];
    quantities: Record<string, number>;
    customLines: QuoteLineInput[];
  } {
    const matches: DesignMatchedItem[] = [];
    const quantities: Record<string, number> = {};
    const customLines: QuoteLineInput[] = [];

    for (const row of picks) {
      if (row.selectedSku) {
        const fromCand = row.candidates.find((c) => c.sku === row.selectedSku);
        const match =
          row.match && (row.match.porItemId || row.match.key) === row.selectedSku
            ? row.match
            : fromCand
              ? candidateToMatch(fromCand)
              : null;
        if (match) {
          matches.push(match);
          quantities[match.key] = row.qty;
          continue;
        }
      }
      // Custom / unmatched — blank line for Amazon / MTO / etc.
      if (row.customName.trim() || row.qty > 0) {
        customLines.push({
          qty: row.qty,
          description: row.customName.trim() || row.term,
          unitRate: row.customRate,
          kind: "product",
        });
      }
    }
    return { matches, quantities, customLines };
  }

  async function buildFromPicks() {
    setBusy(true);
    setError(null);
    try {
      const { matches, quantities, customLines } = picksToMatchesAndQty();
      if (!matches.length && !customLines.length) {
        setError("Pick at least one item (or add a custom line).");
        return;
      }

      let nextQuote: Quote;
      let nextEmail = "";
      let nextTicket = "";

      if (matches.length) {
        const built = await buildQuoteFromMatchesApi({
          matches,
          quantities,
          serviceLines: [],
          customerName: customer.customerName || undefined,
          eventDate: customer.eventDate || undefined,
          salesRep: customer.salesRep || createdBy,
        });
        nextQuote = built.quote;
        nextEmail = built.emailDraft;
        nextTicket = built.ticketText;
        if (customLines.length) {
          const merged = await buildQuoteApi({
            productLines: [
              ...nextQuote.productLines.map(lineToInput),
              ...customLines,
            ],
            serviceLines: nextQuote.serviceLines.map(lineToInput),
            customerName: customer.customerName || undefined,
            eventDate: customer.eventDate || undefined,
            salesRep: customer.salesRep || createdBy,
          });
          nextQuote = merged.quote;
          nextEmail = merged.emailDraft;
          nextTicket = merged.ticketText;
        }
      } else {
        const built = await buildQuoteApi({
          productLines: customLines,
          customerName: customer.customerName || undefined,
          eventDate: customer.eventDate || undefined,
          salesRep: customer.salesRep || createdBy,
        });
        nextQuote = built.quote;
        nextEmail = built.emailDraft;
        nextTicket = built.ticketText;
      }

      setQuote(nextQuote);
      setEmailDraft(nextEmail);
      setTicketText(nextTicket);
      setStep("quote");
      if (customer.eventDate) {
        await runAvailability(nextQuote, customer.eventDate);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function lineToInput(line: QuoteLine): QuoteLineInput {
    return {
      qty: line.qty,
      description: line.description,
      unitRate: line.unitRate,
      porItemName: line.porItemName,
      porItemId: line.porItemId,
      category: line.category,
      size: line.size,
      color: line.color,
      kind: line.kind,
    };
  }

  async function rebuildFromEditedLines(next: Quote) {
    setBusy(true);
    setError(null);
    try {
      const built = await buildQuoteApi({
        productLines: next.productLines.map(lineToInput),
        serviceLines: next.serviceLines.map(lineToInput),
        customerName: customer.customerName || undefined,
        eventDate: customer.eventDate || undefined,
        salesRep: customer.salesRep || createdBy,
        applyRounding: false,
      });
      setQuote(built.quote);
      setEmailDraft(built.emailDraft);
      setTicketText(built.ticketText);
      if (customer.eventDate) {
        await runAvailability(built.quote, customer.eventDate);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runAvailability(q: Quote, date: string) {
    const lines = q.productLines
      .filter((l) => l.porItemId)
      .map((l) => ({ itemKey: l.porItemId!, qty: l.qty }));
    if (!lines.length || !date) {
      setAvailability(null);
      return;
    }
    try {
      const res = await checkQuoteAvailabilityApi({ lines, date });
      setAvailability({
        anyOverbooked: res.anyOverbooked,
        results: res.results,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function availFor(porItemId?: string) {
    if (!porItemId || !availability) return null;
    return (
      availability.results.find((r) => r.itemKey === porItemId) ?? null
    );
  }

  function updateProductLine(index: number, patch: Partial<QuoteLine>) {
    if (!quote) return;
    const productLines = quote.productLines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    );
    setQuote({ ...quote, productLines });
  }

  function updateServiceLine(index: number, patch: Partial<QuoteLine>) {
    if (!quote) return;
    const serviceLines = quote.serviceLines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    );
    setQuote({ ...quote, serviceLines });
  }

  function addServiceLine() {
    if (!quote) return;
    setQuote({
      ...quote,
      serviceLines: [
        ...quote.serviceLines,
        {
          qty: 1,
          description: "Delivery",
          unitRate: 0,
          kind: "service",
          lineTotal: 0,
        },
      ],
    });
  }

  async function saveToQueue(status: QuoteQueueStatus = "draft") {
    if (!quote) return;
    setBusy(true);
    setError(null);
    setSaveMsg(null);
    setGuardInfo(null);
    try {
      // Refresh totals/email from current edited lines before save
      const built = await buildQuoteApi({
        productLines: quote.productLines.map(lineToInput),
        serviceLines: quote.serviceLines.map(lineToInput),
        customerName: customer.customerName || undefined,
        eventDate: customer.eventDate || undefined,
        salesRep: customer.salesRep || createdBy,
        applyRounding: false,
      });
      setQuote(built.quote);
      setEmailDraft(built.emailDraft);
      setTicketText(built.ticketText);

      if (editingId) {
        const result = await updateSavedQuoteApi(editingId, {
          status,
          customer,
          quote: built.quote,
          emailDraft: built.emailDraft,
          ticketText: built.ticketText,
          createdBy: customer.salesRep || createdBy,
        });
        setEditingId(result.quote.id);
        if (result.guard) setGuardInfo(result.guard);
        setSaveMsg(
          result.guard?.warnings?.length
            ? `Updated — ${result.guard.summary}`
            : "Updated in shared queue.",
        );
      } else {
        const result = await saveQuoteToQueue({
          createdBy: customer.salesRep || createdBy,
          status,
          customer,
          quote: built.quote,
          emailDraft: built.emailDraft,
          ticketText: built.ticketText,
        });
        setEditingId(result.quote.id);
        if (result.guard) setGuardInfo(result.guard);
        setSaveMsg(
          result.guard?.warnings?.length
            ? `Saved — ${result.guard.summary}`
            : "Saved to shared queue.",
        );
      }
      await refreshQueue();
    } catch (err) {
      if (err instanceof QuoteOverbookedError) {
        setGuardInfo(err.guard);
        setError(err.guard.summary);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setSaveMsg(`${label} copied.`);
    } catch {
      setError(`Couldn’t copy ${label}.`);
    }
  }

  function printTicket() {
    const w = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
    if (!w) {
      setError("Pop-up blocked — allow pop-ups to print the ticket.");
      return;
    }
    w.document.write(
      `<pre style="font:14px/1.45 ui-monospace,Menlo,monospace;padding:24px;white-space:pre-wrap">${ticketText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  const stepIndex =
    step === "capture" ? 0 : step === "pick" ? 1 : step === "customer" ? 2 : 3;

  return (
    <div>
      <PageHeader
        eyebrow="Showroom"
        title="Quoting"
        description="Build a client quote from voice, photo, or catalog — check availability, email, and save to the shared review queue. Does not write to POR."
        action={
          screen === "queue" ? (
            <button
              type="button"
              className="pp-btn-primary px-5 py-3 text-sm"
              onClick={startNew}
            >
              New quote
            </button>
          ) : (
            <button
              type="button"
              className="pp-btn-secondary px-5 py-3 text-sm"
              onClick={() => {
                resetBuilder();
                setScreen("queue");
              }}
            >
              Shared queue
            </button>
          )
        }
      />

      {screen === "queue" ? (
        <QueueView
          queue={queue}
          loading={queueLoading}
          error={queueError}
          onRefresh={refreshQueue}
          onOpen={openSaved}
          onDelete={async (id) => {
            await deleteSavedQuoteApi(id);
            await refreshQueue();
          }}
          onStatus={async (id, status) => {
            try {
              const result = await updateSavedQuoteApi(id, { status });
              if (result.guard?.warnings?.length) {
                setSaveMsg(result.guard.summary);
                setGuardInfo(result.guard);
              }
              await refreshQueue();
            } catch (err) {
              if (err instanceof QuoteOverbookedError) {
                setGuardInfo(err.guard);
                setQueueError(err.guard.summary);
              } else {
                setQueueError((err as Error).message);
              }
            }
          }}
        />
      ) : (
        <div className="space-y-5">
          <ol className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            {(["capture", "pick", "customer", "quote"] as BuilderStep[]).map(
              (s, i) => (
                <li
                  key={s}
                  className={`rounded-full border px-3 py-1 ${
                    i === stepIndex
                      ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]"
                      : i < stepIndex
                        ? "border-emerald-500/30 text-emerald-600"
                        : "border-[var(--pp-border)]"
                  }`}
                >
                  {i + 1}.{" "}
                  {s === "capture"
                    ? "Capture"
                    : s === "pick"
                      ? "Pick"
                      : s === "customer"
                        ? "Customer"
                        : "Quote"}
                </li>
              ),
            )}
          </ol>

          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          {guardInfo && !guardInfo.ok ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">Blocked — overbooked</p>
              <p className="mt-1">{guardInfo.summary}</p>
              <ul className="mt-2 list-disc pl-4 text-xs">
                {guardInfo.conflicts.map((c) => (
                  <li key={c.sku}>
                    {c.name}: need {c.requested}, only {c.available} free (short{" "}
                    {c.shortBy})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {guardInfo?.ok && guardInfo.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Approve with eyes open</p>
              <p className="mt-1">{guardInfo.summary}</p>
              <ul className="mt-2 list-disc pl-4 text-xs">
                {guardInfo.warnings.map((c) => (
                  <li key={c.sku}>
                    {c.name}: {c.requested} requested, {c.available} firm-free,{" "}
                    soft holds overlap
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {saveMsg ? (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              {saveMsg}
            </p>
          ) : null}

          {step === "capture" ? (
            <CapturePanel
              mode={captureMode}
              onMode={setCaptureMode}
              command={command}
              onCommand={setCommand}
              busy={busy}
              speechSupported={speech.supported}
              listening={speech.listening}
              interim={speech.interim}
              speechError={speech.error}
              onMicStart={speech.start}
              onMicStop={speech.stop}
              onParse={runCandidates}
              onPhoto={runPhoto}
              browseQuery={browseQuery}
              onBrowseQuery={setBrowseQuery}
              browseHits={browseHits}
              onBrowseSearch={runBrowseSearch}
              onAddBrowse={addBrowseItem}
              onGoPick={() => {
                if (picks.length) setStep("pick");
                else setError("Add at least one catalog item first.");
              }}
              pickCount={picks.length}
            />
          ) : null}

          {step === "pick" ? (
            <PickPanel
              picks={picks}
              busy={busy}
              onUpdate={updatePick}
              onRemove={removePick}
              onAddBlank={addBlankPick}
              onBack={() => setStep("capture")}
              onNext={() => setStep("customer")}
            />
          ) : null}

          {step === "customer" ? (
            <CustomerPanel
              customer={customer}
              busy={busy}
              onChange={setCustomer}
              onBack={() => setStep(picks.length ? "pick" : "capture")}
              onNext={() => {
                if (editingId && quote && picks.length === 0) {
                  void rebuildFromEditedLines(quote).then(() =>
                    setStep("quote"),
                  );
                  return;
                }
                void buildFromPicks();
              }}
            />
          ) : null}

          {step === "quote" && quote ? (
            <QuoteReviewPanel
              quote={quote}
              customer={customer}
              emailDraft={emailDraft}
              ticketText={ticketText}
              availability={availability}
              busy={busy}
              onUpdateProduct={updateProductLine}
              onUpdateService={updateServiceLine}
              onAddService={addServiceLine}
              onRecalc={() => void rebuildFromEditedLines(quote)}
              onCheckAvail={() => {
                if (!customer.eventDate) {
                  setError("Enter an event date to check availability.");
                  return;
                }
                void runAvailability(quote, customer.eventDate);
              }}
              onEventDate={(date) => {
                setCustomer((c) => ({ ...c, eventDate: date }));
                if (date && quote) void runAvailability(quote, date);
              }}
              availFor={availFor}
              onSave={(status) => void saveToQueue(status)}
              onCopyEmail={() => void copyText(emailDraft, "Email draft")}
              onCopyTicket={() => void copyText(ticketText, "Ticket")}
              onPrint={printTicket}
              onBack={() => setStep("customer")}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function QueueView({
  queue,
  loading,
  error,
  onRefresh,
  onOpen,
  onDelete,
  onStatus,
}: {
  queue: SavedQuote[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onOpen: (row: SavedQuote) => void;
  onDelete: (id: string) => Promise<void>;
  onStatus: (id: string, status: QuoteQueueStatus) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--pp-text-muted)]">
          Shared review queue — Shelly, Divine, Cayden, and the whole showroom
          see the same list. Marking reviewed/sent runs the overbooking guard.
        </p>
        <button
          type="button"
          className="pp-btn-secondary px-4 py-2 text-sm"
          onClick={() => void onRefresh()}
        >
          Refresh
        </button>
      </div>
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--pp-text-muted)]">Loading queue…</p>
      ) : queue.length === 0 ? (
        <div className="pp-panel rounded-2xl p-8 text-center text-sm text-[var(--pp-text-muted)]">
          No quotes yet. Start a new quote to replace the paper Rental Proposal.
        </div>
      ) : (
        <div className="pp-panel overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="pp-table-head text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Event</th>
                <th className="px-5 py-3 font-semibold">Total</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">By</th>
                <th className="px-5 py-3 font-semibold">Updated</th>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.id} className="border-t border-[var(--pp-border)]">
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      className="text-left font-medium text-[var(--pp-accent)] hover:underline"
                      onClick={() => onOpen(row)}
                    >
                      {row.customer.customerName || "Untitled client"}
                    </button>
                    <p className="text-xs text-[var(--pp-text-muted)]">
                      {row.customer.customerPhone || row.customer.customerEmail}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-[var(--pp-text-muted)]">
                    {row.customer.eventDate || "—"}
                    {row.customer.fulfillment === "delivery"
                      ? " · Delivery"
                      : " · Pickup"}
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {money(row.quote.totals.total)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusClass(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[var(--pp-text-muted)]">
                    {row.createdBy}
                  </td>
                  <td className="px-5 py-4 text-[var(--pp-text-muted)]">
                    {formatTime(row.updatedAt)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-[var(--pp-accent)]"
                        onClick={() => onOpen(row)}
                      >
                        Open
                      </button>
                      {row.status === "draft" ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-emerald-600"
                          onClick={() => void onStatus(row.id, "reviewed")}
                        >
                          Mark reviewed
                        </button>
                      ) : null}
                      {row.status !== "sent" ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-emerald-600"
                          onClick={() => void onStatus(row.id, "sent")}
                        >
                          Mark sent
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-500"
                        onClick={() => {
                          if (confirm("Remove this quote from the queue?")) {
                            void onDelete(row.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CapturePanel({
  mode,
  onMode,
  command,
  onCommand,
  busy,
  speechSupported,
  listening,
  interim,
  speechError,
  onMicStart,
  onMicStop,
  onParse,
  onPhoto,
  browseQuery,
  onBrowseQuery,
  browseHits,
  onBrowseSearch,
  onAddBrowse,
  onGoPick,
  pickCount,
}: {
  mode: CaptureMode;
  onMode: (m: CaptureMode) => void;
  command: string;
  onCommand: (v: string) => void;
  busy: boolean;
  speechSupported: boolean;
  listening: boolean;
  interim: string;
  speechError: string | null;
  onMicStart: () => void;
  onMicStop: () => void;
  onParse: () => void;
  onPhoto: (file: File) => void;
  browseQuery: string;
  onBrowseQuery: (v: string) => void;
  browseHits: Array<PorCatalogItem & { score: number }>;
  onBrowseSearch: () => void;
  onAddBrowse: (item: PorCatalogItem & { score: number }) => void;
  onGoPick: () => void;
  pickCount: number;
}) {
  return (
    <div className="pp-panel rounded-2xl p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["type", "Type / dictate"],
            ["photo", "Photo"],
            ["browse", "Browse catalog"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              mode === id
                ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]"
                : "border-[var(--pp-border)] text-[var(--pp-text-muted)]"
            }`}
            onClick={() => onMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "type" ? (
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            What’s on the table?
          </label>
          <textarea
            value={command}
            onChange={(e) => onCommand(e.target.value)}
            rows={4}
            placeholder='e.g. "120 gold chargers, 130 forks, 12 round tables, 120 wine glasses"'
            className="pp-input w-full px-4 py-3 text-sm"
          />
          {interim ? (
            <p className="text-xs italic text-[var(--pp-text-muted)]">
              Listening: {interim}
            </p>
          ) : null}
          {speechError ? (
            <p className="text-xs text-red-500">{speechError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {speechSupported ? (
              <button
                type="button"
                className={`pp-btn-secondary px-4 py-2.5 text-sm ${listening ? "ring-2 ring-[var(--pp-accent)]" : ""}`}
                onMouseDown={onMicStart}
                onMouseUp={onMicStop}
                onMouseLeave={onMicStop}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onMicStart();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onMicStop();
                }}
              >
                {listening ? "Listening… release to stop" : "Hold to dictate"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              className="pp-btn-primary px-5 py-2.5 text-sm"
              onClick={onParse}
            >
              {busy ? "Finding SKUs…" : "Find matching SKUs"}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "photo" ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--pp-text-muted)]">
            Photograph the tablescape. Madison matches pieces to real Party
            Perfect SKUs — you confirm quantities next.
          </p>
          <textarea
            value={command}
            onChange={(e) => onCommand(e.target.value)}
            rows={2}
            placeholder="Optional hint: gold chargers, champagne flutes…"
            className="pp-input w-full px-4 py-3 text-sm"
          />
          <label className="pp-btn-primary inline-flex cursor-pointer px-5 py-2.5 text-sm">
            {busy ? "Matching…" : "Upload tablescape photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {mode === "browse" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={browseQuery}
              onChange={(e) => onBrowseQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onBrowseSearch();
                }
              }}
              placeholder="Search catalog — charger, chiavari, gold…"
              className="pp-input min-w-[220px] flex-1 px-4 py-3 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              className="pp-btn-primary px-5 py-2.5 text-sm"
              onClick={onBrowseSearch}
            >
              Search
            </button>
            {pickCount > 0 ? (
              <button
                type="button"
                className="pp-btn-secondary px-5 py-2.5 text-sm"
                onClick={onGoPick}
              >
                Review {pickCount} item{pickCount === 1 ? "" : "s"} →
              </button>
            ) : null}
          </div>
          <ul className="divide-y divide-[var(--pp-border)]">
            {browseHits.map((item) => (
              <li
                key={item.sku}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-[var(--pp-text)]">{item.name}</p>
                  <p className="text-xs text-[var(--pp-text-muted)]">
                    {item.category || "—"} · {money(item.ratePerDay)}/day ·{" "}
                    {item.available} avail
                  </p>
                </div>
                <button
                  type="button"
                  className="pp-btn-secondary px-3 py-2 text-xs"
                  onClick={() => onAddBrowse(item)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PickPanel({
  picks,
  busy,
  onUpdate,
  onRemove,
  onAddBlank,
  onBack,
  onNext,
}: {
  picks: PickRow[];
  busy: boolean;
  onUpdate: (id: string, patch: Partial<PickRow>) => void;
  onRemove: (id: string) => void;
  onAddBlank: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--pp-text-muted)]">
        Tap the right SKU for each item. Leave unmatched as a custom line (Amazon
        / made-to-order) — don’t guess.
      </p>
      {picks.map((row) => (
        <div key={row.id} className="pp-panel rounded-2xl p-4 lg:p-5">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                Requested
              </p>
              <p className="font-medium text-[var(--pp-text)]">{row.term}</p>
            </div>
            <label className="text-xs text-[var(--pp-text-muted)]">
              Qty
              <input
                type="number"
                min={1}
                value={row.qty}
                onChange={(e) =>
                  onUpdate(row.id, { qty: Number(e.target.value) || 1 })
                }
                className="pp-input ml-2 w-20 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              className="ml-auto text-xs font-semibold text-red-500"
              onClick={() => onRemove(row.id)}
            >
              Remove
            </button>
          </div>

          {row.candidates.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {row.candidates.slice(0, 3).map((c) => {
                const selected = row.selectedSku === c.sku;
                return (
                  <button
                    key={c.sku}
                    type="button"
                    onClick={() => onUpdate(row.id, { selectedSku: c.sku })}
                    className={`rounded-xl border p-3 text-left transition ${
                      selected
                        ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)]"
                        : "border-[var(--pp-border)] hover:border-[var(--pp-accent)]/50"
                    }`}
                  >
                    <p className="text-sm font-medium text-[var(--pp-text)]">
                      {c.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                      {money(c.ratePerDay)}/day · {c.available} avail
                      {c.category ? ` · ${c.category}` : ""}
                    </p>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onUpdate(row.id, { selectedSku: null })}
                className={`rounded-xl border p-3 text-left text-sm ${
                  row.selectedSku === null
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-dashed border-[var(--pp-border)] text-[var(--pp-text-muted)]"
                }`}
              >
                Custom / not in catalog
              </button>
            </div>
          ) : row.match ? (
            <div className="rounded-xl border border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] p-3 text-sm">
              <p className="font-medium">{row.match.name}</p>
              <p className="text-xs text-[var(--pp-text-muted)]">
                {money(row.match.porPricePerDay ?? 0)}/day
                {typeof row.match.porAvailable === "number"
                  ? ` · ${row.match.porAvailable} avail`
                  : ""}
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-amber-700"
                onClick={() => onUpdate(row.id, { selectedSku: null })}
              >
                Treat as custom instead
              </button>
            </div>
          ) : null}

          {row.selectedSku === null ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={row.customName}
                onChange={(e) =>
                  onUpdate(row.id, { customName: e.target.value })
                }
                placeholder="Description (Amazon / MTO / etc.)"
                className="pp-input px-3 py-2 text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={row.customRate}
                onChange={(e) =>
                  onUpdate(row.id, {
                    customRate: Number(e.target.value) || 0,
                  })
                }
                placeholder="Rate / day"
                className="pp-input px-3 py-2 text-sm"
              />
            </div>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pp-btn-secondary px-4 py-2.5 text-sm"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          className="pp-btn-secondary px-4 py-2.5 text-sm"
          onClick={onAddBlank}
        >
          Add blank / custom line
        </button>
        <button
          type="button"
          disabled={busy || picks.length === 0}
          className="pp-btn-primary px-5 py-2.5 text-sm"
          onClick={onNext}
        >
          Customer & event →
        </button>
      </div>
    </div>
  );
}

function CustomerPanel({
  customer,
  busy,
  onChange,
  onBack,
  onNext,
}: {
  customer: QuoteCustomerEvent;
  busy: boolean;
  onChange: (c: QuoteCustomerEvent) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const set = (patch: Partial<QuoteCustomerEvent>) =>
    onChange({ ...customer, ...patch });

  return (
    <div className="pp-panel space-y-4 rounded-2xl p-5 lg:p-6">
      <p className="text-sm text-[var(--pp-text-muted)]">
        Same fields as the paper Rental Proposal. Event date drives availability.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Event date">
          <input
            type="date"
            value={customer.eventDate}
            onChange={(e) => set({ eventDate: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Event start time">
          <input
            type="time"
            value={customer.eventStartTime}
            onChange={(e) => set({ eventStartTime: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Sales rep">
          <input
            value={customer.salesRep || ""}
            onChange={(e) => set({ salesRep: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
            placeholder="Shelly / Divine / Cayden…"
          />
        </Field>
        <Field label="Customer name">
          <input
            value={customer.customerName}
            onChange={(e) => set({ customerName: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Phone">
          <input
            value={customer.customerPhone}
            onChange={(e) => set({ customerPhone: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={customer.customerEmail}
            onChange={(e) => set({ customerEmail: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Guest count">
          <input
            value={customer.guestCount || ""}
            onChange={(e) => set({ guestCount: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Theme / colors">
          <input
            value={customer.themeColors || ""}
            onChange={(e) => set({ themeColors: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Venue">
          <input
            value={customer.venue || ""}
            onChange={(e) => set({ venue: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={customer.fulfillment === "pickup"}
            onChange={() => set({ fulfillment: "pickup" })}
          />
          Customer pick-up
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={customer.fulfillment === "delivery"}
            onChange={() => set({ fulfillment: "delivery" })}
          />
          Delivery
        </label>
      </div>

      {customer.fulfillment === "delivery" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Delivery address">
            <input
              value={customer.deliveryAddress || ""}
              onChange={(e) => set({ deliveryAddress: e.target.value })}
              className="pp-input w-full px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="Location type">
            <select
              value={customer.locationType || ""}
              onChange={(e) => set({ locationType: e.target.value })}
              className="pp-input w-full px-3 py-2.5 text-sm"
            >
              <option value="">—</option>
              <option>House</option>
              <option>Carport/Garage</option>
              <option>Backyard</option>
              <option>Steps/Stairs</option>
              <option>Hotel/Banquet Room</option>
              <option>Other</option>
            </select>
          </Field>
        </div>
      ) : null}

      <Field label="Notes">
        <textarea
          value={customer.notes || ""}
          onChange={(e) => set({ notes: e.target.value })}
          rows={2}
          className="pp-input w-full px-3 py-2.5 text-sm"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pp-btn-secondary px-4 py-2.5 text-sm"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          className="pp-btn-primary px-5 py-2.5 text-sm"
          onClick={onNext}
        >
          {busy ? "Building quote…" : "Build quote →"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
      {label}
      <div className="mt-1.5 font-normal normal-case tracking-normal">
        {children}
      </div>
    </label>
  );
}

function QuoteReviewPanel({
  quote,
  customer,
  emailDraft,
  ticketText,
  availability,
  busy,
  onUpdateProduct,
  onUpdateService,
  onAddService,
  onRecalc,
  onCheckAvail,
  onEventDate,
  availFor,
  onSave,
  onCopyEmail,
  onCopyTicket,
  onPrint,
  onBack,
}: {
  quote: Quote;
  customer: QuoteCustomerEvent;
  emailDraft: string;
  ticketText: string;
  availability: {
    anyOverbooked: boolean;
    results: QuoteAvailabilityLineResult[];
  } | null;
  busy: boolean;
  onUpdateProduct: (i: number, patch: Partial<QuoteLine>) => void;
  onUpdateService: (i: number, patch: Partial<QuoteLine>) => void;
  onAddService: () => void;
  onRecalc: () => void;
  onCheckAvail: () => void;
  onEventDate: (date: string) => void;
  availFor: (porItemId?: string) => QuoteAvailabilityLineResult | null;
  onSave: (status: QuoteQueueStatus) => void;
  onCopyEmail: () => void;
  onCopyTicket: () => void;
  onPrint: () => void;
  onBack: () => void;
}) {
  const t = quote.totals;

  return (
    <div className="space-y-5">
      {availability?.anyOverbooked ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700">
          Overbooking on {customer.eventDate || "event date"} — at least one
          line requests more than available (firm R/O holds). Advisory only —
          does not write to POR.
        </div>
      ) : null}

      <div className="pp-panel overflow-x-auto rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pp-border)] px-5 py-3">
          <h3 className="text-sm font-semibold text-[var(--pp-text)]">
            Line items
          </h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={customer.eventDate}
              onChange={(e) => onEventDate(e.target.value)}
              className="pp-input px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              className="pp-btn-secondary px-3 py-2 text-xs"
              onClick={onCheckAvail}
            >
              Check availability
            </button>
            <button
              type="button"
              disabled={busy}
              className="pp-btn-secondary px-3 py-2 text-xs"
              onClick={onRecalc}
            >
              Recalc totals
            </button>
          </div>
        </div>
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="pp-table-head text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 font-semibold">Qty</th>
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 font-semibold">Rate</th>
              <th className="px-4 py-3 font-semibold">Line</th>
              <th className="px-4 py-3 font-semibold">Avail</th>
            </tr>
          </thead>
          <tbody>
            {quote.productLines.map((line, i) => {
              const a = availFor(line.porItemId);
              return (
                <tr key={`p-${i}`} className="border-t border-[var(--pp-border)]">
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      value={line.qty}
                      onChange={(e) =>
                        onUpdateProduct(i, {
                          qty: Number(e.target.value) || 0,
                        })
                      }
                      className="pp-input w-20 px-2 py-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={line.description}
                      onChange={(e) =>
                        onUpdateProduct(i, { description: e.target.value })
                      }
                      className="pp-input w-full min-w-[160px] px-2 py-1.5 text-sm"
                    />
                    {line.lineNote ? (
                      <p className="mt-1 text-[10px] text-[var(--pp-text-muted)]">
                        {line.lineNote}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      value={line.unitRate}
                      onChange={(e) =>
                        onUpdateProduct(i, {
                          unitRate: Number(e.target.value) || 0,
                        })
                      }
                      className="pp-input w-24 px-2 py-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {money(line.lineTotal)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a?.overbooked ? (
                      <span className="font-semibold text-red-600">
                        OVERBOOKED (only {a.available} available on{" "}
                        {customer.eventDate})
                      </span>
                    ) : a?.tight ? (
                      <span className="font-semibold text-amber-600">
                        Tight — {a.softHeld} pending quotes
                      </span>
                    ) : a ? (
                      <span className="text-[var(--pp-text-muted)]">
                        {a.available} free
                      </span>
                    ) : (
                      <span className="text-[var(--pp-text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {quote.serviceLines.map((line, i) => (
              <tr key={`s-${i}`} className="border-t border-[var(--pp-border)]">
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    value={line.qty}
                    onChange={(e) =>
                      onUpdateService(i, { qty: Number(e.target.value) || 0 })
                    }
                    className="pp-input w-20 px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={line.description}
                    onChange={(e) =>
                      onUpdateService(i, { description: e.target.value })
                    }
                    className="pp-input w-full min-w-[160px] px-2 py-1.5 text-sm"
                  />
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Service
                  </p>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={line.unitRate}
                    onChange={(e) =>
                      onUpdateService(i, {
                        unitRate: Number(e.target.value) || 0,
                      })
                    }
                    className="pp-input w-24 px-2 py-1.5 text-sm"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{money(line.lineTotal)}</td>
                <td className="px-4 py-3 text-[var(--pp-text-muted)]">—</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-[var(--pp-border)] px-5 py-3">
          <button
            type="button"
            className="text-xs font-semibold text-[var(--pp-accent)]"
            onClick={onAddService}
          >
            + Add service line
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="pp-panel rounded-2xl p-5">
          <h3 className="mb-3 text-sm font-semibold">Totals</h3>
          <dl className="space-y-2 text-sm">
            <TotRow label="Product subtotal" value={money(t.productSubtotal)} />
            <TotRow label="Service subtotal" value={money(t.serviceSubtotal)} />
            <TotRow label="Subtotal" value={money(t.subtotal)} />
            <TotRow label="Sales tax (8.517%)" value={money(t.salesTax)} />
            <TotRow label="Damage waiver (5%)" value={money(t.damageWaiver)} />
            <TotRow label="Total" value={money(t.total)} bold />
            <TotRow label="Deposit (50%)" value={money(t.deposit)} accent />
          </dl>
          {quote.notes.length ? (
            <ul className="mt-3 list-disc pl-4 text-xs text-[var(--pp-text-muted)]">
              {quote.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="pp-panel rounded-2xl p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Client email</h3>
              <button
                type="button"
                className="text-xs font-semibold text-[var(--pp-accent)]"
                onClick={onCopyEmail}
              >
                Copy
              </button>
            </div>
            <textarea
              value={emailDraft}
              readOnly
              rows={8}
              className="pp-input w-full px-3 py-2 font-mono text-xs leading-5"
            />
          </div>
          <div className="pp-panel rounded-2xl p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">POR-ready ticket</h3>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--pp-accent)]"
                  onClick={onCopyTicket}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--pp-accent)]"
                  onClick={onPrint}
                >
                  Print
                </button>
              </div>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--pp-border)] bg-[var(--pp-accent-muted)] p-3 font-mono text-xs leading-5">
              {ticketText}
            </pre>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pp-btn-secondary px-4 py-2.5 text-sm"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          className="pp-btn-primary px-5 py-2.5 text-sm"
          onClick={() => onSave("draft")}
        >
          {busy ? "Saving…" : "Save to queue"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="pp-btn-secondary px-4 py-2.5 text-sm"
          onClick={() => onSave("reviewed")}
        >
          Save as reviewed
        </button>
        <button
          type="button"
          disabled={busy}
          className="pp-btn-secondary px-4 py-2.5 text-sm"
          onClick={() => onSave("sent")}
        >
          Mark sent & save
        </button>
      </div>
    </div>
  );
}

function TotRow({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt
        className={
          accent
            ? "text-[var(--pp-accent)]"
            : "text-[var(--pp-text-muted)]"
        }
      >
        {label}
      </dt>
      <dd
        className={
          bold
            ? "font-semibold text-[var(--pp-text)]"
            : accent
              ? "font-semibold text-[var(--pp-accent)]"
              : "text-[var(--pp-text)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}
