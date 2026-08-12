# CLAUDE -> CURSOR: production audio intake endpoint

Context: Claude built a Tier-2 LOCAL intake worker on the Mac (`~/Matter/worker/`) that already works today
(Shortcut -> Mac -> whisper.cpp -> `/api/ai-core/tasks`). This is the DURABLE server version so the Shortcut
can eventually post straight to partyperfect.app instead of the Mac. Same AI Core, same tasks — no second brain.

## Build: `POST /api/ai-core/intake/audio`
Auth (do NOT expose DB/service creds to the phone; do NOT use Mason's PIN as the API secret):
- Accept EITHER an existing session (native app) OR a device token for the Shortcut prototype.
  Add a small `ai_core` device-token mechanism (a hashed token per registered device -> actor). v0 can be a
  single `AUDIO_INTAKE_DEVICE_TOKEN` env mapped to actor=mason; design the column so multiple devices/actors
  (Josh, etc.) can be added without a rewrite.
- Resolve actor -> allowed domain via existing `resolveAllowedDomain(role, { persona })`. Persona is a request;
  the server governs the domain (mike->party_perfect, matter->mershon_personal).

Request: multipart or raw body audio (`.m4a`/AAC) + `persona` + `mode` (`talk` | `meeting`).

Flow (return a fast 202 — do not wait on transcription):
1. authenticate device/session -> actor -> allowed domain (403 if not allowed).
2. store ORIGINAL in **Vercel Blob** (already integrated: `@vercel/blob`, `BLOB_READ_WRITE_TOKEN`). Keep it
   private (not public). storage_provider=`vercel-blob`, storage_key=<blob path>.
3. compute sha256 + bytes + duration (ffprobe on the worker, or accept client-provided + verify).
4. insert `ai_core.artifacts` (kind=`audio`, storage_provider, storage_key, sha256, bytes, duration,
   mime_type, domain, created_by). Tables already exist in 0003 (`ai_core.artifacts`, `ai_core.meetings`).
   Idempotency: if sha256 already ingested for this domain, reuse it — never double-store/transcribe.
5. talk mode -> create `ai_core.tasks` (type=`voice`, source=`shortcut`|`matter-ios`).
   meeting mode -> create `ai_core.meetings` row (source_audio_ref = artifact) + a processing task.
6. respond 202 `{ status:"uploaded", message:"Uploaded. Mike is processing this.", artifactId, taskId }`.

## Transcription
Do NOT transcribe inline in the request. A worker stage transcribes (local whisper.cpp today; server later)
and updates the task/meeting with the transcript + extracted items. For v0, the existing Mac worker can pull
un-transcribed artifacts, OR keep transcription on the Mac worker entirely and have this endpoint only handle
store+record+ack. Recommend: endpoint stores + records + acks; transcription/extraction is a separate stage
(staged small-worker pipeline: segment -> topics/entities -> decisions/tasks -> dedupe -> escalate-if-needed).

## Cost/observability (capture points, no dashboard yet)
On each processing job record: provider, model, input/output/cached tokens, latency, retry count, est. cost,
context records loaded, artifact/transcript refs. Just capture the fields now.

## Do NOT
Touch POR. Apply 0002. Deploy without Mason's approval. Store giant audio blobs in Postgres (blob only holds
the file; Postgres holds metadata/refs). Block the phone on transcription.
