import type { Metadata } from "next";
import { PinEntry } from "@/app/time/pins/pin-entry";

export const metadata: Metadata = {
  title: "Secure PIN Entry · Party Perfect Time",
  robots: { index: false, follow: false },
};

export default function TimePinEntryPage() {
  return <PinEntry />;
}
