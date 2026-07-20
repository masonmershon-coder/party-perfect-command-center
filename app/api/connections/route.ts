import {
  connectAccount,
  disconnectAccount,
  disconnectBySessionToken,
  listConnections,
  sanitizeConnection,
} from "@/lib/connection-sessions";
import type { ConnectionType } from "@/lib/types";
import { NextResponse } from "next/server";

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
  const sessionTokens = parseSessionTokens(request);
  const connections = await listConnections(sessionTokens);
  return NextResponse.json({
    connections: connections.map(sanitizeConnection),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: ConnectionType;
      accountKey?: string;
      label?: string;
    };

    if (!body.type || !body.accountKey?.trim() || !body.label?.trim()) {
      return NextResponse.json(
        { error: "type, accountKey, and label are required." },
        { status: 400 },
      );
    }

    const connection = await connectAccount({
      type: body.type,
      accountKey: body.accountKey.trim(),
      label: body.label.trim(),
    });

    return NextResponse.json(
      { connection: sanitizeConnection(connection) },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: ConnectionType;
      accountKey?: string;
      sessionToken?: string;
    };

    if (body.sessionToken) {
      const removed = await disconnectBySessionToken(body.sessionToken);
      if (!removed) {
        return NextResponse.json({ error: "Connection not found." }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    if (!body.type || !body.accountKey) {
      return NextResponse.json(
        { error: "Provide sessionToken or type + accountKey." },
        { status: 400 },
      );
    }

    const removed = await disconnectAccount(body.type, body.accountKey);
    if (!removed) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to disconnect account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
