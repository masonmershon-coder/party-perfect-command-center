# Matter Core Alpha — portable runtime package for the Mac Mini

**Prepared:** 2026-09-30 · **NOT INSTALLED. NOT ARMED.**
LaunchAgent installation is held behind explicit approval — see §13.

---

## 1. Exact commit to deploy

| | |
|---|---|
| **Use** | `agent/cursor/MATTER-CORE-ALPHA-SUPERVISOR-REPAIR` @ **`7bbfd1c4d03e80d5fefc9c704e58439f805d6864`** |
| Base | `agent/matter-core-alpha` @ `c509783877a7a1948a921971c10df305605e879c` |

**Do not deploy the base commit.** At `c509783` the supervisor's interval is created with
`.unref()`, which does not hold the event loop open. The repair removes it with the comment
*"Must stay referenced (no .unref()): this handle is what keeps the supervisor process alive."*
That repair passed Codex review as part of PR #13.

Verify what you checked out before starting anything:

```bash
git rev-parse HEAD           # must print 7bbfd1c4d03e80d5fefc9c704e58439f805d6864
grep -c 'unref()' AI-HANDOFF/matter/core-alpha.mjs    # must print 0
```

---

## 2. Required Node version

`package.json` declares `engines.node >= 20`. Validated on **v22.22.2** (MacBook Air).
Use Node 20 LTS or 22 LTS on the Mini.

```bash
node -v      # expect v20.x or v22.x
```

`core-alpha.mjs` needs no dependency install — it imports only `node:` builtins plus two
sibling modules in the repo. **Do not run `npm install` for the supervisor alone.**

---

## 3. Clone the repository

```bash
git clone https://github.com/masonmershon-coder/party-perfect-command-center.git ~/matter-core
cd ~/matter-core
git fetch origin agent/cursor/MATTER-CORE-ALPHA-SUPERVISOR-REPAIR
git checkout 7bbfd1c4d03e80d5fefc9c704e58439f805d6864
git rev-parse HEAD
```

A detached checkout at an exact SHA is intentional: the running node must be pinned, not
tracking a branch that can move under it.

---

## 4. Choosing `MATTER_DATA_ROOT`

**The supervisor refuses to start without it and will not guess a path** — exit code 78,
`"MATTER_DATA_ROOT is required; refusing to guess a disk/volume path."`

**The 4 TB drive's mount path is not recorded here and must not be assumed.** The physical
machine identifies it:

```bash
diskutil list                       # find the 4 TB device
df -h                               # confirm its mount point and free space
mount | grep -i <volume name>       # confirm it is read-write, not read-only
```

Requirements for the chosen directory:
- on the 4 TB volume, not the boot disk
- read-write for the account that will run the supervisor
- on a volume that mounts automatically at login — a supervisor pointed at an unmounted
  volume writes into an empty mount point on the boot disk instead, silently
- not inside the git clone (runtime state must never become a commit)

```bash
export MATTER_DATA_ROOT="/Volumes/<confirmed volume>/matter-data"
mkdir -p "$MATTER_DATA_ROOT/logs"
df -h "$MATTER_DATA_ROOT"           # record filesystem and free space
```

---

## 5. Data-root layout

Created by the supervisor on first start. Everything mutable lives here; nothing mutable
lives in the clone.

```
$MATTER_DATA_ROOT/
├── MATTER_POLICY.json     seeded from the repo on first start only; never overwritten
├── CORE_HEALTH.json       health snapshot, rewritten atomically each pass
├── WORKER_REGISTRY.json   worker presence (probe/heartbeat/ack)
├── LEASES.json            durable task leases
├── LEASE_LOG.jsonl        append-only lease events
└── logs/
    ├── core.out.log
    └── core.err.log
```

`MATTER_DIR` and `MATTER_EXEC_DIR` are both set to `MATTER_DATA_ROOT` by the supervisor,
so registry and execution state cannot diverge into two directories.

Health file is written via temp-file + atomic rename at mode `0600` — a reader never sees
a half-written file.

---

## 6. Start in the foreground

Always do this first. Foreground failures are visible; LaunchAgent failures are not.

```bash
cd ~/matter-core
MATTER_DATA_ROOT="/Volumes/<confirmed volume>/matter-data" \
MATTER_CORE_INTERVAL_SEC=30 \
node AI-HANDOFF/matter/core-alpha.mjs
```

Interval floor is 15s; the default is 30s. Optional `MATTER_NODE_ID` labels this node in
the health file (defaults to hostname).

---

## 7. Graceful stop

`SIGTERM` and `SIGINT` are both handled, guarded against double-fire.

```bash
Ctrl-C                    # foreground
kill -TERM <pid>          # by pid
```

Leases are durable on disk: a stop mid-pass loses no state, and expired leases are
reclaimed by the next running supervisor.

---

## 8. Health-file validation

```bash
cat "$MATTER_DATA_ROOT/CORE_HEALTH.json" | python3 -m json.tool
```

Check:
- `schema_version` is 1
- `pid` matches the running process
- `last_pass_at` advances every interval — **watch it change at least twice**
- `data_root` is the 4 TB path, **not** a boot-disk path
- `disk.mount` is the expected volume and `available_bytes` is sane
- `hostname` / `node_id` identify the Mini, not another machine

```bash
for i in 1 2 3; do python3 -c "import json;print(json.load(open('$MATTER_DATA_ROOT/CORE_HEALTH.json'))['last_pass_at'])"; sleep 35; done
```

Three distinct, increasing timestamps = the loop is alive. This is also the check that
catches the `.unref()` regression: a supervisor that exits leaves a frozen `last_pass_at`.

---

## 9. Heartbeat validation

Each pass probes every registered worker and, when available, records a heartbeat and a
policy ack.

```bash
python3 -c "
import json;h=json.load(open('$MATTER_DATA_ROOT/CORE_HEALTH.json'))
print('workers:',[(w['worker_id'],w['available']) for w in h['workers']])"
```

Then confirm the registry itself advanced:

```bash
python3 -c "
import json;r=json.load(open('$MATTER_DATA_ROOT/WORKER_REGISTRY.json'))
[print(k, v.get('last_heartbeat'), v.get('last_probe')) for k,v in r.get('workers',{}).items()]"
```

**A heartbeat timestamp is proof only of the moment it was written.** An old heartbeat in a
health file is historical, not current presence — the same rule the freshness contract
applies to data sources.

---

## 10. Lease-recovery validation

`reclaim()` runs every pass and its result appears as `recovered` in the health file.

Hermetic proof, no live workers needed:

```bash
MATTER_DIR=$(mktemp -d) MATTER_EXEC_DIR=$(mktemp -d) node AI-HANDOFF/matter/test-execution.mjs
```

Expect 11/11 — lease granted, second lessee refused, stale token refused, expiry reclaimed,
retry under a new token, dead-letter at the attempt limit.

On the Mini, after a real expiry:

```bash
python3 -c "
import json;h=json.load(open('$MATTER_DATA_ROOT/CORE_HEALTH.json'))
print('recovered:',h.get('recovered'));print('abandoned:',h['execution'].get('abandoned'))"
```

**`abandoned` must be empty.** A non-empty list means work was leased and never returned.

---

## 11. Duplicate-task validation

Enqueue is idempotent by `task_id`; a second enqueue of the same id must not create a
second record, and a live lease blocks a second lessee.

```bash
MATTER_EXEC_DIR=$(mktemp -d) node -e '
const d=process.env.MATTER_EXEC_DIR;
import("./AI-HANDOFF/matter/execution.mjs").then(X=>{
  X.enqueue("DUP-1"); X.enqueue("DUP-1");
  const s=X.status();
  console.log("total (expect 1):", s.total, "queued:", s.byState.QUEUED);
  const a=X.lease("DUP-1","w-a",{ttlSec:60});
  let refused=false; try{X.lease("DUP-1","w-b",{ttlSec:60})}catch(e){refused=/leased by w-a/.test(e.message)}
  console.log("second lessee refused (expect true):", refused);
});'
```

---

## 12. Restart validation

1. Note `pid` and `last_pass_at`.
2. Stop with `SIGTERM`.
3. Start again in the foreground.
4. Confirm: new `pid`, `last_pass_at` resumes advancing, `WORKER_REGISTRY.json` and
   `LEASES.json` still hold their prior contents, and `MATTER_POLICY.json` was **not**
   re-seeded over (first-start-only by design).
5. Confirm any lease that expired while stopped appears in `recovered`.

Restart must not lose durable state or duplicate tasks. If either happens, stop and report.

---

## 13. LaunchAgent — HELD, requires explicit approval

`AI-HANDOFF/matter/install-core-alpha.sh` installs a user LaunchAgent
`app.kituwa.matter-core-alpha` with `RunAtLoad`, `KeepAlive`, `ThrottleInterval 15`, and
logs to `$MATTER_DATA_ROOT/logs/`. It uses no `sudo`.

**Do not run it until foreground validation §6–§12 has passed and installation is
explicitly approved.** Arming a supervisor that restarts itself is materially different
from running one you can watch: a bad build then respawns on every failure.

Prerequisites before it is even considered:
- foreground run stable across several intervals
- `last_pass_at` advancing, `abandoned` empty
- the 4 TB volume mounts automatically at login (else `KeepAlive` respawns into a wrong path)
- `MATTER_DATA_ROOT` recorded in the approval record

---

## 14. Log locations

| | |
|---|---|
| Foreground | stdout / stderr in the terminal |
| LaunchAgent (if approved) | `$MATTER_DATA_ROOT/logs/core.out.log`, `core.err.log` |
| Lease events | `$MATTER_DATA_ROOT/LEASE_LOG.jsonl` (append-only) |
| Health | `$MATTER_DATA_ROOT/CORE_HEALTH.json` (rewritten each pass) |

Pass failures are logged as `matter-core pass failed:` and do **not** kill the loop.

---

## 15. Rollback and removal

**Foreground:** `Ctrl-C`. Nothing persists beyond the data root.

**If a LaunchAgent was ever installed:**

```bash
launchctl bootout "gui/$UID/app.kituwa.matter-core-alpha" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/app.kituwa.matter-core-alpha.plist"
launchctl list | grep matter-core     # expect no output
```

**Data root:** preserve it. It holds durable leases and worker history — it is evidence,
not scratch. Archive rather than delete if the node is being retired.

**Repository:** `rm -rf ~/matter-core` removes the clone. Nothing outside it was modified;
the supervisor writes only inside `MATTER_DATA_ROOT`.

---

## 16. What this package does not do

- Does not install, arm, or schedule anything.
- Does not guess the 4 TB mount path.
- Does not contact POR, ENTERPRISE, Redis, SQL, or any production system.
- Does not change credentials or permissions.
- Does not claim the supervisor is running — every validation in §8–§12 is a check to be
  performed on the Mini, not a result recorded here.
