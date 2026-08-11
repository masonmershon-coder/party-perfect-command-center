import { isAuthError, requireSession } from "@/lib/server-auth";
import { getPorSnapshot, getPorSyncMeta } from "@/lib/por-snapshot";
import {
  createInventoryItem,
  listInventory,
  listInventoryFees,
  updateInventoryItem,
} from "@/lib/storage";
import type { CreateInventoryInput } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;
  const [inventory, fees, por] = await Promise.all([
    listInventory(),
    listInventoryFees(),
    getPorSnapshot(),
  ]);
  const porMeta = getPorSyncMeta(por);
  const stripRates = <T extends { pricePerDay: number }>(rows: T[]) =>
    gate.role === "owner"
      ? rows
      : rows.map((item) => ({ ...item, pricePerDay: 0 }));
  return NextResponse.json({
    inventory: stripRates(inventory),
    fees: stripRates(fees),
    source: porMeta.present ? "por" : "local",
    por: porMeta,
  });
}

export async function POST(request: Request) {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;
  try {
    const por = await getPorSnapshot();
    if (por) {
      return NextResponse.json(
        {
          error:
            "Inventory is mirrored from Point of Rental (read-only). Edit stock in POR Counter.",
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as CreateInventoryInput;

    if (!body.name?.trim() || !body.category?.trim()) {
      return NextResponse.json(
        { error: "name and category are required." },
        { status: 400 },
      );
    }

    const item = await createInventoryItem(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create inventory item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id: string;
      patch: Partial<CreateInventoryInput & { available: number; quantity: number }>;
    };

    if (!body.id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const item = await updateInventoryItem(body.id, body.patch);

    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update inventory item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
