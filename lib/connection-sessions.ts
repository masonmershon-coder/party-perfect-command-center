import { readDurableJson, writeDurableJson } from "./durable-json";
import type { ConnectionType } from "./types";

export interface StoredConnection {
  id: string;
  type: ConnectionType;
  accountKey: string;
  label: string;
  connectedAt: string;
  /** Opaque token returned to client for localStorage — maps to this record */
  sessionToken: string;
  /** Live OAuth only — long-lived token stored server-side, never sent to browser */
  oauthAccessToken?: string;
  expiresAt?: string;
}

const CONNECTIONS_KEY = "connections.json";

function now() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

function createSessionToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function readConnections(): Promise<StoredConnection[]> {
  const data = await readDurableJson<StoredConnection[]>(CONNECTIONS_KEY, []);
  return Array.isArray(data) ? data : [];
}

async function writeConnections(connections: StoredConnection[]) {
  await writeDurableJson(CONNECTIONS_KEY, connections);
}

export async function listConnections(
  sessionTokens?: string[],
): Promise<StoredConnection[]> {
  const connections = await readConnections();
  if (!sessionTokens?.length) return connections;
  const tokenSet = new Set(sessionTokens);
  return connections.filter((connection) =>
    tokenSet.has(connection.sessionToken),
  );
}

export async function getConnectionByKey(
  type: ConnectionType,
  accountKey: string,
): Promise<StoredConnection | null> {
  const connections = await readConnections();
  return (
    connections.find(
      (connection) =>
        connection.type === type && connection.accountKey === accountKey,
    ) ?? null
  );
}

export async function connectAccount(input: {
  type: ConnectionType;
  accountKey: string;
  label: string;
  oauthAccessToken?: string;
  expiresAt?: string;
}): Promise<StoredConnection> {
  const connections = await readConnections();
  const existingIndex = connections.findIndex(
    (connection) =>
      connection.type === input.type &&
      connection.accountKey === input.accountKey,
  );

  const connection: StoredConnection = {
    id: existingIndex >= 0 ? connections[existingIndex].id : createId(),
    type: input.type,
    accountKey: input.accountKey,
    label: input.label,
    connectedAt: now(),
    sessionToken:
      existingIndex >= 0
        ? connections[existingIndex].sessionToken
        : createSessionToken(),
    oauthAccessToken: input.oauthAccessToken,
    expiresAt: input.expiresAt,
  };

  if (existingIndex >= 0) {
    connections[existingIndex] = connection;
  } else {
    connections.push(connection);
  }

  await writeConnections(connections);
  return connection;
}

export async function disconnectAccount(
  type: ConnectionType,
  accountKey: string,
): Promise<boolean> {
  const connections = await readConnections();
  const next = connections.filter(
    (connection) =>
      !(connection.type === type && connection.accountKey === accountKey),
  );
  if (next.length === connections.length) return false;
  await writeConnections(next);
  return true;
}

export async function disconnectBySessionToken(
  sessionToken: string,
): Promise<boolean> {
  const connections = await readConnections();
  const next = connections.filter(
    (connection) => connection.sessionToken !== sessionToken,
  );
  if (next.length === connections.length) return false;
  await writeConnections(next);
  return true;
}

/** Strip secrets before sending to client */
export function sanitizeConnection(connection: StoredConnection) {
  return {
    id: connection.id,
    type: connection.type,
    accountKey: connection.accountKey,
    label: connection.label,
    connectedAt: connection.connectedAt,
    sessionToken: connection.sessionToken,
    expiresAt: connection.expiresAt,
    hasOAuthToken: Boolean(connection.oauthAccessToken),
  };
}
