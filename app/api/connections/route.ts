import {
  connectAccount,
  disconnectAccount,
  disconnectBySessionToken,
  listConnections,
  sanitizeConnection,
} from "@/lib/connection-sessions";
import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import type { ConnectionType } from "@/lib/types";

export const runtime = "nodejs";

function parseSessionTokens(request: Request) {
  const header = request.headers.get("X-PP-Session-Tokens");
  if (!header) return [];
  return header
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const gate = await requireApiAuth("connections");
  if (isAuthError(gate)) return gate;

  const sessionTokens = parseSessionTokens(request);
  // Empty tokens → [] (never dump the full connection store).
  // Owner may request ?all=1 for metadata without sessionToken fields.
  const wantAll =
    gate.role === "owner" &&
    new URL(request.url).searchParams.get("all") === "1";

  const connections = wantAll
    ? await listConnections(undefined)
    : await listConnections(sessionTokens);

  return privateJson({
    connections: connections.map((c) => sanitizeConnection(c)),
  });
}

export async function POST(request: Request) {
  const gate = await requireApiAuth("connections");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await request.json()) as {
      type?: ConnectionType;
      accountKey?: string;
      label?: string;
    };

    if (!body.type || !body.accountKey?.trim() || !body.label?.trim()) {
      return privateJson(
        { error: "type, accountKey, and label are required." },
        { status: 400 },
      );
    }

    const connection = await connectAccount({
      type: body.type,
      accountKey: body.accountKey.trim(),
      label: body.label.trim(),
    });

    // Issue opaque sessionToken once so the client can store it locally.
    return privateJson(
      {
        connection: sanitizeConnection(connection, {
          includeSessionToken: true,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect account.";
    return privateJson({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireApiAuth("connections");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await request.json()) as {
      type?: ConnectionType;
      accountKey?: string;
      sessionToken?: string;
    };

    if (body.sessionToken) {
      const removed = await disconnectBySessionToken(body.sessionToken);
      if (!removed) {
        return privateJson({ error: "Connection not found." }, { status: 404 });
      }
      return privateJson({ success: true });
    }

    if (!body.type || !body.accountKey) {
      return privateJson(
        { error: "Provide sessionToken or type + accountKey." },
        { status: 400 },
      );
    }

    // type+accountKey disconnect is owner-only (avoids guessing keys with a stolen session).
    if (gate.role !== "owner") {
      return privateJson({ error: "Forbidden" }, { status: 403 });
    }

    const removed = await disconnectAccount(body.type, body.accountKey);
    if (!removed) {
      return privateJson({ error: "Connection not found." }, { status: 404 });
    }

    return privateJson({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to disconnect account.";
    return privateJson({ error: message }, { status: 500 });
  }
}
