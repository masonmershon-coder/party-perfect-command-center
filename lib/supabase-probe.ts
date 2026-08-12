import pg from "pg";

export type DatabaseUriAudit = {
  configured: boolean;
  validUri: boolean;
  isPlaceholder: boolean;
  poolerType:
    | "transaction_pooler"
    | "session_pooler_or_direct_via_pooler_host"
    | "direct_db_host"
    | "transaction_pooler_port"
    | "invalid"
    | "none"
    | "unknown";
  port: number | null;
  userHint: string | null;
  hostHint: string | null;
  refMatch: boolean;
  expectedPooler: boolean;
  reason: string;
};

export type SupabaseReadOnlyProbe = {
  uri: DatabaseUriAudit;
  connection: "ok" | "fail" | "skipped";
  connectionError?: string;
  por: {
    schemaPresent: boolean;
    tables: string[];
    missingTables: string[];
    rowCounts?: Record<string, string | number>;
    rlsEnabledTables: string[];
    isOwnerFnPresent: boolean;
    policyCount: number;
  };
  aiCore: {
    schemaPresent: boolean;
    tables: string[];
    missingTables: string[];
    needsMigration0003: boolean;
    rowCounts?: Record<string, string | number>;
    rlsEnabledTables: string[];
  };
};

const EXPECTED_POR_TABLES = [
  "customers",
  "contracts",
  "contract_items",
  "payments",
  "items",
  "salesmen",
  "sync_meta",
];

const EXPECTED_AI_CORE_TABLES = [
  "projects",
  "tasks",
  "meetings",
  "artifacts",
  "approvals",
  "brain_records",
  "audit_log",
];

export function auditDatabaseUri(raw?: string | null): DatabaseUriAudit {
  const urlRaw = raw?.trim() ?? "";
  if (!urlRaw) {
    return {
      configured: false,
      validUri: false,
      isPlaceholder: false,
      poolerType: "none",
      port: null,
      userHint: null,
      hostHint: null,
      refMatch: false,
      expectedPooler: false,
      reason: "DATABASE_URL missing or empty",
    };
  }
  if (urlRaw.includes("[") || urlRaw.includes("]") || !urlRaw.includes("@")) {
    return {
      configured: true,
      validUri: false,
      isPlaceholder: true,
      poolerType: "invalid",
      port: null,
      userHint: null,
      hostHint: null,
      refMatch: false,
      expectedPooler: false,
      reason: "Not a Postgres URI (placeholder or malformed)",
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(urlRaw);
  } catch {
    return {
      configured: true,
      validUri: false,
      isPlaceholder: false,
      poolerType: "invalid",
      port: null,
      userHint: null,
      hostHint: null,
      refMatch: false,
      expectedPooler: false,
      reason: "Could not parse DATABASE_URL as URI",
    };
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    return {
      configured: true,
      validUri: false,
      isPlaceholder: false,
      poolerType: "invalid",
      port: parsed.port ? Number(parsed.port) : null,
      userHint: parsed.username || null,
      hostHint: parsed.hostname || null,
      refMatch: false,
      expectedPooler: false,
      reason: `Wrong scheme: ${parsed.protocol}`,
    };
  }

  const port = parsed.port ? Number(parsed.port) : 5432;
  const userHint = decodeURIComponent(parsed.username || "");
  const hostHint = parsed.hostname || "";
  const expectedRef = "wkwksjitkyhaqgrxasml";
  const refMatch =
    userHint.includes(expectedRef) || hostHint.includes(expectedRef);

  let poolerType: DatabaseUriAudit["poolerType"] = "unknown";
  if (port === 6543 && userHint.startsWith("postgres.")) {
    poolerType = "transaction_pooler";
  } else if (
    port === 6543 &&
    hostHint.startsWith("db.") &&
    hostHint.endsWith(".supabase.co")
  ) {
    poolerType = "invalid";
  } else if (port === 5432 && hostHint.includes("pooler.supabase.com")) {
    poolerType = "session_pooler_or_direct_via_pooler_host";
  } else if (port === 5432 && !hostHint.includes("pooler")) {
    poolerType = "direct_db_host";
  } else if (port === 6543) {
    poolerType = "transaction_pooler_port";
  }

  const misconfiguredDirectHost =
    port === 6543 &&
    hostHint.startsWith("db.") &&
    hostHint.endsWith(".supabase.co");

  const expectedPooler = poolerType === "transaction_pooler";
  let reason = expectedPooler
    ? "Transaction pooler URI (port 6543, postgres.<ref> user, pooler host)"
    : `Expected transaction pooler (6543 + postgres.<ref> @ *.pooler.supabase.com); got ${poolerType}`;
  if (misconfiguredDirectHost) {
    reason =
      "Misconfigured: db.<ref>.supabase.co is the direct host (does not resolve for serverless). Use Supabase Connect → Transaction pooler → URI with *.pooler.supabase.com:6543 and user postgres.<ref>";
  }

  return {
    configured: true,
    validUri: true,
    isPlaceholder: false,
    poolerType,
    port,
    userHint,
    hostHint,
    refMatch,
    expectedPooler,
    reason,
  };
}

async function query<T extends pg.QueryResultRow>(
  client: pg.Client,
  sql: string,
  params: unknown[] = [],
) {
  const { rows } = await client.query<T>(sql, params);
  return rows;
}

/** Read-only: por / ai_core / RLS introspection. Never throws — returns connection fail in payload. */
export async function probeSupabaseReadOnly(): Promise<SupabaseReadOnlyProbe> {
  const uri = auditDatabaseUri(process.env.DATABASE_URL);
  const emptyPor = {
    schemaPresent: false,
    tables: [] as string[],
    missingTables: EXPECTED_POR_TABLES,
    rlsEnabledTables: [] as string[],
    isOwnerFnPresent: false,
    policyCount: 0,
  };
  const emptyAi = {
    schemaPresent: false,
    tables: [] as string[],
    missingTables: EXPECTED_AI_CORE_TABLES,
    needsMigration0003: true,
    rlsEnabledTables: [] as string[],
  };

  if (!uri.validUri) {
    return {
      uri,
      connection: "skipped",
      por: emptyPor,
      aiCore: emptyAi,
    };
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12_000,
  });

  try {
    await client.connect();

    const porSchemaRows = await query<{ schema_name: string }>(
      client,
      `select schema_name from information_schema.schemata where schema_name = 'por'`,
    );
    const porSchemaPresent = porSchemaRows.length > 0;
    const porTables = porSchemaPresent
      ? await query<{ table_name: string }>(
          client,
          `select table_name from information_schema.tables
           where table_schema = 'por' and table_type = 'BASE TABLE'
           order by table_name`,
        )
      : [];
    const porTableNames = porTables.map((r) => r.table_name);
    const missingPor = EXPECTED_POR_TABLES.filter(
      (t) => !porTableNames.includes(t),
    );

    let porRowCounts: Record<string, string | number> | undefined;
    if (porSchemaPresent && porTableNames.includes("customers")) {
      const [counts] = await query<Record<string, string>>(
        client,
        `select
           (select count(*)::bigint from por.customers) as customers,
           (select count(*)::bigint from por.contracts) as contracts,
           (select count(*)::bigint from por.contract_items) as contract_items,
           (select count(*)::bigint from por.payments) as payments,
           (select count(*)::bigint from por.items) as items,
           (select count(*)::bigint from por.salesmen) as salesmen`,
      );
      porRowCounts = counts;
    }

    const porRls = porSchemaPresent
      ? await query<{ table_name: string; rls_enabled: boolean }>(
          client,
          `select c.relname as table_name, c.relrowsecurity as rls_enabled
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'por' and c.relkind = 'r' order by c.relname`,
        )
      : [];

    const porFn = await query<{ proname: string }>(
      client,
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'por' and proname = 'is_owner'`,
    );

    const porPolicies = porSchemaPresent
      ? await query<{ policyname: string }>(
          client,
          `select policyname from pg_policies where schemaname = 'por'`,
        )
      : [];

    const aiSchemaRows = await query<{ schema_name: string }>(
      client,
      `select schema_name from information_schema.schemata where schema_name = 'ai_core'`,
    );
    const aiSchemaPresent = aiSchemaRows.length > 0;
    const aiTables = aiSchemaPresent
      ? await query<{ table_name: string }>(
          client,
          `select table_name from information_schema.tables
           where table_schema = 'ai_core' and table_type = 'BASE TABLE'
           order by table_name`,
        )
      : [];
    const aiTableNames = aiTables.map((r) => r.table_name);
    const missingAi = EXPECTED_AI_CORE_TABLES.filter(
      (t) => !aiTableNames.includes(t),
    );

    let aiRowCounts: Record<string, string | number> | undefined;
    if (aiSchemaPresent && aiTableNames.includes("tasks")) {
      const [counts] = await query<Record<string, string>>(
        client,
        `select
           (select count(*)::bigint from ai_core.tasks) as tasks,
           (select count(*)::bigint from ai_core.approvals) as approvals,
           (select count(*)::bigint from ai_core.audit_log) as audit_log`,
      );
      aiRowCounts = counts;
    }

    const aiRls = aiSchemaPresent
      ? await query<{ table_name: string; rls_enabled: boolean }>(
          client,
          `select c.relname as table_name, c.relrowsecurity as rls_enabled
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'ai_core' and c.relkind = 'r' order by c.relname`,
        )
      : [];

    return {
      uri,
      connection: "ok",
      por: {
        schemaPresent: porSchemaPresent,
        tables: porTableNames,
        missingTables: missingPor,
        rowCounts: porRowCounts,
        rlsEnabledTables: porRls
          .filter((r) => r.rls_enabled)
          .map((r) => r.table_name),
        isOwnerFnPresent: porFn.length > 0,
        policyCount: porPolicies.length,
      },
      aiCore: {
        schemaPresent: aiSchemaPresent,
        tables: aiTableNames,
        missingTables: missingAi,
        needsMigration0003: !aiSchemaPresent || missingAi.length > 0,
        rowCounts: aiRowCounts,
        rlsEnabledTables: aiRls
          .filter((r) => r.rls_enabled)
          .map((r) => r.table_name),
      },
    };
  } catch (error) {
    return {
      uri,
      connection: "fail",
      connectionError:
        error instanceof Error ? error.message : "Database connection failed",
      por: emptyPor,
      aiCore: emptyAi,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export function isValidTransactionPoolerUri(raw?: string | null): boolean {
  return auditDatabaseUri(raw).expectedPooler;
}
