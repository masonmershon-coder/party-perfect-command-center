import {
  deleteDesignAsset,
  listDesignAssets,
} from "@/lib/design-studio";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const assets = await listDesignAssets();
    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load Design Studio.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
    } | null;
    const id = body?.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing asset id." }, { status: 400 });
    }
    await deleteDesignAsset(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete asset.",
      },
      { status: 500 },
    );
  }
}
