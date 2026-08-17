"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  active: boolean;
  protected: boolean;
  pinStatus: "CONFIGURED" | "NOT CONFIGURED";
};

type RosterResponse = {
  employees: EmployeeRow[];
  configured: number;
  remaining: number;
  canManageProtected: boolean;
  error?: string;
};

type Reconciliation = {
  saved: number;
  configured: number;
  remaining: number;
  errors: { employeeId: string; error: string }[];
};

async function pinApi<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/time/admin/pins", {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export function PinEntry() {
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Reconciliation | null>(null);

  const loadRoster = useCallback(async () => {
    setError("");
    try {
      setRoster(await pinApi<RosterResponse>());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load the employee roster.",
      );
    }
  }, []);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const entered = useMemo(
    () =>
      Object.entries(pins)
        .filter(([, pin]) => pin.length === 4)
        .map(([employeeId, pin]) => ({ employeeId, pin })),
    [pins],
  );

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roster?.employees || [];
    return (roster?.employees || []).filter((employee) =>
      `${employee.firstName} ${employee.lastName} ${employee.department}`
        .toLowerCase()
        .includes(query),
    );
  }, [roster?.employees, search]);

  async function commitBatch() {
    if (!entered.length) return;
    setSaving(true);
    setError("");
    try {
      const reconciliation = await pinApi<Reconciliation>({
        method: "POST",
        body: JSON.stringify({ entries: entered }),
      });
      setPins({});
      setConfirming(false);
      setResult(reconciliation);
      await loadRoster();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save PINs.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="time-shell time-shell-admin">
      <img className="time-logo" src="/party-perfect-logo.png" alt="Party Perfect" />
      <div className="time-admin">
        <a href="/time" className="time-muted">← Back to Party Perfect Time</a>
        <h1 className="time-title">Secure PIN Entry</h1>
        <p className="time-muted">
          Enter existing 4-digit employee PINs. PINs are hashed on the server,
          never shown after saving, and never included in audit details.
        </p>

        {error ? <div className="time-error">{error}</div> : null}

        {roster ? (
          <div className="time-admin-metrics">
            <div><strong>{roster.configured}</strong><span>Configured</span></div>
            <div><strong>{roster.remaining}</strong><span>Remaining</span></div>
            <div><strong>{entered.length}</strong><span>Ready to save</span></div>
          </div>
        ) : null}

        {result ? (
          <div className="time-admin-card" role="status">
            <h2>Reconciliation</h2>
            <p>{result.configured} employees configured</p>
            <p>{result.remaining} remaining</p>
            <p>{result.errors.length} errors</p>
          </div>
        ) : null}

        <div className="time-admin-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search employees"
          />
        </div>

        <div className="time-admin-stack">
          {visibleEmployees.map((employee) => {
            const locked = employee.protected && !roster?.canManageProtected;
            return (
              <article className="time-admin-card" key={employee.id}>
                <div className="time-admin-row">
                  <div>
                    <h2>{employee.firstName} {employee.lastName}</h2>
                    <p className="time-muted">
                      {employee.department || "No department"}
                      {!employee.active ? " · INACTIVE" : ""}
                    </p>
                  </div>
                  <span
                    className={`time-admin-status ${
                      employee.pinStatus === "CONFIGURED" ? "active" : "not_set_up"
                    }`}
                  >
                    {employee.pinStatus}
                  </span>
                </div>
                <input
                  className="time-field"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="\d{4}"
                  maxLength={4}
                  disabled={locked || saving}
                  aria-label={`Existing 4-digit PIN for ${employee.firstName} ${employee.lastName}`}
                  placeholder={locked ? "Mason or Michelle required" : "Enter existing 4-digit PIN"}
                  value={pins[employee.id] || ""}
                  onChange={(event) => {
                    const pin = event.target.value.replace(/\D/g, "").slice(0, 4);
                    setPins((current) => ({ ...current, [employee.id]: pin }));
                    setResult(null);
                  }}
                />
              </article>
            );
          })}
        </div>

        <button
          className="time-btn time-btn-primary"
          type="button"
          disabled={!entered.length || saving}
          onClick={() => setConfirming(true)}
        >
          Review {entered.length} PIN{entered.length === 1 ? "" : "s"}
        </button>

        {confirming ? (
          <div className="time-thanks" role="dialog" aria-modal="true" aria-label="Confirm PIN batch">
            <div className="time-thanks-card">
              <h2>Confirm secure batch</h2>
              <p>
                Save PINs for {entered.length} employee{entered.length === 1 ? "" : "s"}?
                Existing sessions and trusted devices for those employees will be reset.
              </p>
              <button
                className="time-btn time-btn-primary"
                type="button"
                disabled={saving}
                onClick={() => void commitBatch()}
              >
                {saving ? "Saving…" : "Confirm and hash PINs"}
              </button>
              <button
                className="time-btn time-btn-secondary"
                type="button"
                disabled={saving}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
