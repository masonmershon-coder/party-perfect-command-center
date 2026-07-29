import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Map PartyPerfectJobs.com (and www) to the /jobs experience. */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)"],
};
