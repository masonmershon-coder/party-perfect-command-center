import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRIMARY_HOST = "partyperfect.app";

const LEGACY_COMMAND_HOSTS = new Set([
  "partyperfectcomand.app",
  "www.partyperfectcomand.app",
  "partyperfectcommand.app",
  "www.partyperfectcommand.app",
  "www.partyperfect.app",
]);

/** Jobs host rewrite + legacy Command Center host redirects → partyperfect.app */
export function middleware(request: NextRequest) {
  const host = (request.headers.get("host")?.toLowerCase() ?? "").split(":")[0];

  if (LEGACY_COMMAND_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = PRIMARY_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const isJobsDomain =
    host === "partyperfectjobs.com" ||
    host === "www.partyperfectjobs.com" ||
    host.startsWith("partyperfectjobs.");

  if (!isJobsDomain) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (
    pathname === "/" ||
    pathname === "" ||
    pathname.startsWith("/apply")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/jobs";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Keep /api on every attached host so Twilio / POR / OAuth webhooks
  // still work on legacy domains until those services are updated.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)"],
};
