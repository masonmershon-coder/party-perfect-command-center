#!/usr/bin/env python3
"""Regression tests for POR STAT classification.

Runs against the verbatim POR export on the PARTYPERF SSD, so the expected
numbers below are ground truth from the real database, not fixtures we invented.

    python3 por-sync-agent/tests/test_por_status.py

Set POR_EXPORT_DIR to point elsewhere. Skips (exit 0) if the export is absent so
CI without the SSD mounted does not fail.

These lock in the 2026-08-12 findings:
  * STAT is two characters; a BLANK primary means Completed.
  * LTRIM before taking char 1 corrupts 54.8% of rows -> must never be used.
  * The old exact filter STAT IN ('R','O','Q') saw 803 of 15,022 rows.
  * Each consumer scope has its own predicate.
"""
import csv
import os
import sys

EXPORT_DIR = os.environ.get(
    "POR_EXPORT_DIR",
    "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA",
)
SNAPSHOT_DATE = "2026-08-10"

# Ground truth measured from the export on 2026-08-12.
EXPECTED = {
    "total_rows": 36006,
    "active_reservations": 306,
    "open_orders": 49,
    "open_quotes": 177,
    "old_filter_rowset": 803,
    "primary_char_rowset": 15022,
    "ltrim_corrupted_rows": 19723,
}

PRIMARY = {
    " ": "Completed", "": "Completed", "A": "Adjustment", "C": "Closed",
    "D": "Completed", "F": "FinanceCharge", "O": "Open", "Q": "Quote",
    "R": "Reservation", "W": "WorkOrder",
}


def primary_char(stat):
    """Char 1 of STAT. No LTRIM -- a leading space IS the Completed state."""
    return (stat or " ")[0:1].upper() or " "


def secondary_char(stat):
    return ((stat or "")[1:2] or " ").upper()


def is_true(row, col):
    return (row.get(col) or "").strip().lower() == "true"


def is_live(row):
    return not is_true(row, "Archived") and not is_true(row, "Cancelled")


def is_cancelled(row):
    return secondary_char(row.get("STAT")) == "C" or is_true(row, "Cancelled")


# --- scopes: these mirror Get-PorScopeSql in PorStatus.ps1 one-for-one ---
def scope_active_reservations(r):
    return primary_char(r.get("STAT")) == "R" and is_live(r)


def scope_open_orders(r):
    return primary_char(r.get("STAT")) == "O" and is_live(r)


def scope_open_quotes(r):
    return (
        primary_char(r.get("STAT")) == "Q"
        and secondary_char(r.get("STAT")) not in ("C", "T")
        and is_live(r)
    )


def scope_availability_holds(r):
    # ONLY open orders consume QYOT. Reservations are future-dated.
    return scope_open_orders(r)


def load_rows():
    path = os.path.join(EXPORT_DIR, "Transactions.csv")
    if not os.path.exists(path):
        print(f"SKIP: export not found at {path} (mount the PARTYPERF SSD)")
        sys.exit(0)
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def main():
    rows = load_rows()
    failures = []

    def check(name, actual, expected):
        ok = actual == expected
        print(f"  {'PASS' if ok else 'FAIL'}  {name}: {actual} (expected {expected})")
        if not ok:
            failures.append(name)

    print(f"POR STAT regression -- export {SNAPSHOT_DATE}, {len(rows)} rows\n")

    print("scope counts")
    check("total_rows", len(rows), EXPECTED["total_rows"])
    check("active_reservations",
          sum(1 for r in rows if scope_active_reservations(r)),
          EXPECTED["active_reservations"])
    check("open_orders",
          sum(1 for r in rows if scope_open_orders(r)),
          EXPECTED["open_orders"])
    check("open_quotes",
          sum(1 for r in rows if scope_open_quotes(r)),
          EXPECTED["open_quotes"])

    print("\nregression guards")
    old = sum(1 for r in rows
              if (r.get("STAT") or "").strip().upper() in ("R", "O", "Q"))
    check("old_exact_filter_rowset", old, EXPECTED["old_filter_rowset"])
    by_char = sum(1 for r in rows if primary_char(r.get("STAT")) in ("R", "O", "Q"))
    check("primary_char_rowset", by_char, EXPECTED["primary_char_rowset"])

    corrupted = sum(
        1 for r in rows
        if primary_char(r.get("STAT")) != (((r.get("STAT") or "").lstrip() or " ")[0:1] or " ").upper()
    )
    check("ltrim_corrupted_rows", corrupted, EXPECTED["ltrim_corrupted_rows"])

    print("\ninvariants")
    unknown = sorted({
        primary_char(r.get("STAT")) for r in rows
        if primary_char(r.get("STAT")) not in PRIMARY
    })
    ok = not unknown
    print(f"  {'PASS' if ok else 'FAIL'}  every primary char is a known state"
          f"{'' if ok else f' -- unmapped: {unknown}'}")
    if not ok:
        failures.append("unknown_primary_chars")

    # A reservation must never also be flagged cancelled.
    bad = sum(1 for r in rows if scope_active_reservations(r) and is_cancelled(r))
    ok = bad == 0
    print(f"  {'PASS' if ok else 'FAIL'}  no active reservation is cancelled ({bad})")
    if not ok:
        failures.append("cancelled_active_reservation")

    # Scopes must not overlap -- a row belongs to at most one current scope.
    overlap = sum(
        1 for r in rows
        if sum([scope_active_reservations(r), scope_open_orders(r), scope_open_quotes(r)]) > 1
    )
    ok = overlap == 0
    print(f"  {'PASS' if ok else 'FAIL'}  current scopes are mutually exclusive ({overlap})")
    if not ok:
        failures.append("scope_overlap")

    print()
    if failures:
        print(f"FAILED: {', '.join(failures)}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
