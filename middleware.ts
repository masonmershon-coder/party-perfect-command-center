import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { corsHeadersForOrigin } from "@/lib/security-headers";

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
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host")?.toLowerCase() ?? "").split(":")[0];
  const isKituwaProject =
    process.env.KITUWA_SURFACE === "1" ||
    process.env.VERCEL_PROJECT_NAME === "kituwa";
  const isKituwaHost =
    isKituwaProject ||
    host === "kituwa.app" ||
    host === "www.kituwa.app" ||
    host.endsWith(".kituwa.app");

  if (host === "www.kituwa.app") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = "kituwa.app";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // Strict API CORS. Do not redirect /api on legacy hosts (Twilio / POR webhooks).
  if (pathname.startsWith("/api/")) {
    if (
      isKituwaHost &&
      !pathname.startsWith("/api/kituwa") &&
      pathname !== "/api/health"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const cors = corsHeadersForOrigin(request.headers.get("origin"));
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: cors });
    }
    const res = NextResponse.next();
    for (const [key, value] of Object.entries(cors)) {
      res.headers.set(key, value);
    }
    return res;
  }

  if (isKituwaHost) {
    const kituwaOk =
      pathname === "/kituwa" ||
      pathname.startsWith("/kituwa/") ||
      pathname.startsWith("/api/kituwa") ||
      pathname === "/api/health";
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/kituwa";
      return NextResponse.rewrite(url);
    }
    if (!kituwaOk && pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!kituwaOk) {
      const url = request.nextUrl.clone();
      url.pathname = "/kituwa";
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

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

  if (host === "time.partyperfect.app") {
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/time";
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  if (!isJobsDomain) {
    return NextResponse.next();
  }

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
  // Include /api for CORS only (no legacy-host redirect on API).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
