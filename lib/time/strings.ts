/** Employee-facing copy. English ships first; keys ready for Spanish later. Never say "PWA". */

export const TIME_COPY = {
  en: {
    appName: "Party Perfect Time",
    appNameShort: "the Party Perfect Time app",
    clockIn: "CLOCK IN",
    clockOut: "CLOCK OUT",
    startLunch: "START LUNCH",
    endLunch: "END LUNCH",
    notClockedIn: "NOT CLOCKED IN",
    clockedIn: "CLOCKED IN",
    onLunch: "ON LUNCH",
    youreClockedIn: "YOU'RE CLOCKED IN",
    haveAGreatDay: (name: string) => `Have a good one, ${name}.`,
    dayProgress: "Today's shift",
    notAtLocation: "You're not at an approved Party Perfect location.",
    enableLocation: "Turn on Location for Party Perfect Time, then try again.",
    locationPrivacy:
      "Party Perfect Time uses your location only when you clock in, start/end lunch, or clock out to verify your time.",
    locationRequired:
      "Location is required to record your time. Please allow location access to continue.",
    locationPrivacyPrinciple:
      "We verify where you were when you recorded time. We do not track where you go throughout the day.",
    locationHelpIos:
      "iPhone: Settings → Privacy & Security → Location Services → Party Perfect Time → While Using the App.",
    locationHelpAndroid:
      "Android: Settings → Location → App permissions → Party Perfect Time → Allow only while using the app.",
    installTitle: "Add Party Perfect Time to your Home Screen",
    installAndroid: "INSTALL PARTY PERFECT TIME",
    iosStep1: "Tap the Share button.",
    iosStep2: "Tap “Add to Home Screen.”",
    iosStep3: "Tap “Add.”",
    loginHint: "Enter your first name, last name, and 4-digit PIN.",
    firstName: "First name",
    lastName: "Last name",
    pin: "PIN",
    forgotClockOutTitle: "We need one quick fix",
    forgotClockOutLead: "You forgot to clock out yesterday.",
    forgotClockOutAskTime: "What time did you actually finish work?",
    forgotClockOutAskWhy: "What happened?",
    sendToShelly: "SEND TO SHELLY",
    signOut: "Sign out",
    kioskMode: "Shared device",
    personalMode: "This is my phone",
    todayHours: "Today",
    weekHours: "This week",
    fixMyTime: "Fix My Time",
    requestAChange: "Request a Change",
    reportAbsence: "Report an Absence",
    requestTimeOff: "Request Time Off",
    whyGone: "Why were you gone?",
    absenceNoteHint: "Tell us anything Shelly needs to know.",
    sentToShelly: "Sent to Shelly for review.",
    sendRequest: "SEND REQUEST",
  },
} as const;

/**
 * Random clock-out send-offs. Warm + Party Perfect — not corporate cheerleading.
 * Pick with pickClockOutMessage().
 */
export const CLOCK_OUT_THANKS = [
  "Thanks for today — you helped make someone else's party look easy.",
  "Clocked out. Another wedding got its tables because of shifts like yours.",
  "Good work today. The tent doesn't raise itself.",
  "Thanks for showing up. That's half the magic.",
  "Day's done. You made the party possible.",
  "Appreciate you. Linens don't fold themselves either.",
  "Solid day. See you on the next load.",
  "Thanks for keeping Tulsa's parties on schedule.",
  "You're off the clock. Go rest — tomorrow's events are already counting on people like you.",
  "Nice work. Somebody's dance floor is ready because you were here.",
  "Thanks for the hustle. Deliveries don't drive themselves.",
  "Clocked out. Somebody's reception looks a lot better because you were here.",
  "Good shift. Party Perfect runs on days like this.",
  "Thanks for today. Head home — you earned it.",
  "All set. The warehouse will still be here tomorrow.",
] as const;

export function pickClockOutMessage(name?: string): string {
  const i = Math.floor(Math.random() * CLOCK_OUT_THANKS.length);
  const line = CLOCK_OUT_THANKS[i] || CLOCK_OUT_THANKS[0];
  if (name && Math.random() < 0.35) {
    return `${name.split(" ")[0]}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
  }
  return line;
}

export type TimeLocale = keyof typeof TIME_COPY;
