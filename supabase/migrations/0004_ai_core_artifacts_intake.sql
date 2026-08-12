-- ============================================================
--  Mershon AI — AI CORE 0004: ARTIFACT INTAKE + SHA-256 DEDUP
--  Extends ai_core.artifacts (0003) with the storage metadata that
--  audio/file intake needs, plus content-hash idempotency so the SAME
--  source artifact is stored/transcribed/processed ONCE — never paying
--  twice. Additive only; no destructive changes. NOT auto-applied.
--
--  Principle: SAME DOMAIN + SAME CONTENT HASH
--    -> recognize the existing artifact
--    -> reuse the existing (valid) processing result
--    -> do NOT re-store / re-transcribe / re-embed / re-spend.
-- ============================================================

-- ---- storage metadata for intake (all nullable; additive) ----
alter table ai_core.artifacts add column if not exists storage_provider text;   -- e.g. 'vercel-blob'
alter table ai_core.artifacts add column if not exists storage_key      text;    -- blob path / object key
alter table ai_core.artifacts add column if not exists mime_type        text;
alter table ai_core.artifacts add column if not exists duration_seconds numeric; -- audio/video length (nullable)
alter table ai_core.artifacts add column if not exists updated_at        timestamptz not null default now();

-- ---- processing lifecycle (enables "process once" + safe retry) ----
alter table ai_core.artifacts add column if not exists processing_status text not null default 'PENDING';
alter table ai_core.artifacts add column if not exists processing_result_ref text;   -- transcript/result location (blob key / meeting / task output)
alter table ai_core.artifacts add column if not exists processed_at      timestamptz;
alter table ai_core.artifacts add column if not exists process_error     text;
alter table ai_core.artifacts add column if not exists retry_count       integer not null default 0;

-- constrain the lifecycle vocab (guarded so re-runs don't error)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'artifacts_processing_status_chk'
  ) then
    alter table ai_core.artifacts
      add constraint artifacts_processing_status_chk
      check (processing_status in ('PENDING','PROCESSING','DONE','FAILED'));
  end if;
end $$;

-- ---- THE dedup guarantee ----
-- Partial UNIQUE index: content hash is unique per domain, but only when a hash
-- exists. NULL sha256 (external pointers / not-yet-hashed) are NOT constrained,
-- so they never collide. This is why a plain unique(domain,sha256) is wrong here:
-- it would either forbid multiple NULL-hash rows (older PGs) or block legitimate
-- pointer artifacts. The partial index is the correct tool.
create unique index if not exists ux_artifacts_domain_sha256
  on ai_core.artifacts (domain, sha256)
  where sha256 is not null;

-- lookups by hash (dedup check) and by processing state (worker pull)
create index if not exists artifacts_sha256_idx on ai_core.artifacts (domain, sha256);
create index if not exists artifacts_proc_idx   on ai_core.artifacts (domain, processing_status);

comment on index ai_core.ux_artifacts_domain_sha256 is
  'Dedup: one artifact per (domain, content-hash). Enforces process-once; NULL hashes exempt.';
