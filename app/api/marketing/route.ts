import {
  createMarketingItem,
  listMarketing,
  updateMarketingItem,
} from "@/lib/storage";
import type { CreateMarketingInput } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const marketing = await listMarketing();
  return NextResponse.json({ marketing });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateMarketingInput;

    if (!body.title?.trim() || !body.channel?.trim() || !body.content?.trim()) {
      return NextResponse.json(
        { error: "title, channel, and content are required." },
        { status: 400 },
      );
    }

    const item = await createMarketingItem(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create marketing item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id: string;
      patch: Partial<CreateMarketingInput>;
    };

    if (!body.id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const item = await updateMarketingItem(body.id, body.patch);

    if (!item) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update marketing item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
