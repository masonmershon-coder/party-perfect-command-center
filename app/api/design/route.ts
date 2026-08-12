import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import {
  deleteDesignAsset,
  listDesignAssets,
} from "@/lib/design-studio";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireApiAuth("design");
  if (isAuthError(gate)) return gate;

  try {
    const assets = await listDesignAssets();
    return privateJson({ assets });
  } catch (error) {
    return privateJson(
      {
        error:
          error instanceof Error ? error.message : "Failed to load Design Studio.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const gate = await requireApiAuth("design");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
    } | null;
    const id = body?.id?.trim();
    if (!id) {
      return privateJson({ error: "Missing asset id." }, { status: 400 });
    }
    await deleteDesignAsset(id);
    return privateJson({ success: true });
  } catch (error) {
    return privateJson(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete asset.",
      },
      { status: 500 },
    );
  }
}
