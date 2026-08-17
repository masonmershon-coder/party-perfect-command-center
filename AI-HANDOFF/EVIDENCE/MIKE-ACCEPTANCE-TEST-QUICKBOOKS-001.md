# FAILED ACCEPTANCE TEST — Mike does not execute, only acknowledges

**Test ID:** `MIKE-AT-QUICKBOOKS-001` · **Date:** 2026-08-13 · **Reproduced:** twice by Mason
**Blocks:** `MIKE-TASK-NOTIFY-001` · **Status:** FAILED — open

## The test

Mason sent, in ordinary language:

> *"Mike, check QuickBooks for 2025. Did we make a profit?"*
> and a follow-up asking for the 2025 net profit/loss with source, date range, and
> whether the number is final or needs reconciliation.

**Pass condition:** Mason's next iMessage from Mike contains the actual
evidence-backed 2025 profit/loss figure, its QuickBooks report and date range, and its
reconciliation status. **An acknowledgement is a failure.**

## Result: FAILED

Mike replied with a canned fallback and no work was performed.

| Stage | Result |
|---|---|
| iMessage receive | PASS |
| Sender recognized as Mason | PASS |
| iMessage reply delivered | PASS |
| Request understood / dispatched | **FAIL** |
| Matter task created | **FAIL** |
| QuickBooks result obtained | **FAIL** |
| Actual result texted back | **FAIL** |

**The transport is healthy. The operational brain behind it is not connected.**

## Root cause — exact line

`~/Matter/imessage-bridge/imessage-bridge.mjs:63`, inside `mikeReply()`:

```js
return `Mike heard you, ${senderName}: "${text.slice(0, 120)}". Ops brain wiring in progress — try 'status' or 'help'.`;
```

`mikeReply()` is a **v0 heuristic stub**. It handles exactly three literal inputs —
`status`, `help`, `ping` — and echoes everything else with that fallback. It creates no
task, calls no agent, and reaches no data source. There is no code path from an inbound
message to Matter.

This is consistent with the file's own header, which describes the brain as "v0" with
"real ops actions wire in later".

## Why the notification layer did not help

`AI-HANDOFF/mike-notify/` (commit `b8d1996`) implements acknowledgement, routing,
status and completion messaging — and is **not wired to the bridge**. That was declared
as a known limitation when the task was filed, not discovered afterwards. Nothing Mason
sends reaches it today.

So this failure is **not a regression** in the notification work. It is the missing
piece between them: **inbound message → intent → Matter task → agent → result → reply.**

## Design constraint set by this test

**The fix must not be new syntax for Mason.** His phrasing was adequate. Requiring
`status`, `/quickbooks`, or any magic command is a failed fix. Mike must classify a
plain request, route it through Matter, track it, verify the answer, and text back the
result.

## Also unresolved: the answer itself

Even with routing connected, this test needs a real QuickBooks figure. Party Perfect's
FY2025 books are **not closed** — the bookkeeper left mid-year and reconciliation is an
open work item. So the correct passing answer may legitimately be *"the 2025 net figure
is not final; here is the current unreconciled number, its report and date range, and
what remains."*

**A fabricated or estimated number is a failure, not a pass.** Mason stated this
explicitly, and it is the harder half of the test.

## Rerun instruction

Rerun this exact request unchanged after routing is connected. It passes **only** when
Mason's reply from Mike carries the evidence-backed figure with source and
reconciliation status — never on another acknowledgement.
