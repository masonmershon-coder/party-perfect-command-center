import { redirect } from "next/navigation";

/** Public entry for website "Design W/ AI" sparkle → Madison Design Studio. */
export default function DesignEntryPage() {
  redirect("/?section=design");
}
