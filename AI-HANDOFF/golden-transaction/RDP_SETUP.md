# ENTERPRISE RDP setup — Golden Transaction

**Date:** 2026-08-13 · **Task:** `GOLDEN-TXN-001` · **Authorized by Mason 2026-08-13**
**Status:** prepared to the installation-approval boundary

## Client chosen

**Microsoft Windows App 11.3.8** (`brew install --cask windows-app`).

This is Microsoft's current official macOS RDP client. The older *Microsoft Remote Desktop*
cask is **deprecated and was disabled upstream on 2025-10-01**; Homebrew's own replacement
directive points at `windows-app`. So the "official current Microsoft application" and the
maintained one are the same package.

### Provenance verified before install

Downloaded to the Homebrew cache and checked with `pkgutil --check-signature`:

| Check | Result |
|---|---|
| Signature | **Developer ID Installer: Microsoft Corporation (UBF8T346G9)** |
| Notarization | trusted by the Apple notary service |
| Timestamp | signed 2026-07-20, cert valid to 2027-02-01 |
| Source | `aka.ms/WindowsApp` (Microsoft's own domain) |
| Size | 102,954,769 bytes |

The package is already downloaded. The install itself is the only remaining step.

## Stop point — your admin password

`sudo -n true` fails: this Mac requires an interactive password for admin operations, and the
Windows App artifact is a `.pkg`. **That approval is yours to give and I will not attempt to
work around it.**

```bash
brew install --cask windows-app
```

Run that, enter your macOS admin password at the prompt. Nothing else about it needs deciding.

## Connection profile

`AI-HANDOFF/golden-transaction/ENTERPRISE.rdp` — open it after the install.

**No credential is stored in it, by design:**

| Setting | Value | Why |
|---|---|---|
| `username:s:` | *(blank)* | no identity recorded |
| `prompt for credentials:i:1` | on | you type it into the Windows prompt, every time |
| `promptcredentialonce:i:0` | off | credentials are never cached for reuse |

**Redirection is deliberately off:**

| Setting | Value | Why |
|---|---|---|
| `redirectprinters:i:0` | off | **this one matters for the test.** Redirecting Mac printers would let POR print to *this* machine — the run has to reach the real showroom printer on the server side, or the print step proves nothing |
| `redirectclipboard:i:0` | off | prevents any accidental paste of a credential between machines |
| `drivestoredirect:s:` | empty | the Mac filesystem is not exposed to ENTERPRISE |
| `redirectsmartcards` / `camerastoredirect` / `audiocapturemode` | off | not needed; smaller surface |
| `authentication level:i:2` | strict | fail rather than silently connect unauthenticated |

If macOS offers to save the password in Keychain during login, **decline it** — automatic
credential storage was explicitly not authorized, and I have not enabled it anywhere.

## Reachability — already confirmed

TCP connect only, from this Mac, no authentication attempted:

- `192.168.0.5:3389` — **open** (RDP)
- `192.168.0.5:9676` — open (POR SQL; **not used by this run**)

Nothing was sent to either port beyond a connection handshake.

## What happens after you log in

I do **not** create anything on connect. The sequence is:

1. You authenticate. I never see the credential.
2. I open POR Counter and observe the starting state — no data entered.
3. I walk the runbook's 15 observation points and show you **exactly what will be created**.
4. **You approve the exact test scenario out loud, watching.** Only then does anything save.
5. After save: record the real quote number, reopen it in Counter, verify every field and
   total, produce the native print preview.

Not done, per your instruction: no conversion to reservation or order, no deposit or payment,
no emailing, no deletion or modification afterward, and no direct SQL.

The transaction gets labelled `PARTY PERFECT SYSTEM TEST — 2026-08-13` wherever POR safely
permits it.

## Not changed, and will not be

Firewall · router · VPN · POR configuration · SQL Server · Windows Server · printer settings.
The Sentinel finding about ENTERPRISE's exposed service surface stays recorded and un-acted-on.
