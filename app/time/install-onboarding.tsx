"use client";

import { useEffect, useMemo, useState } from "react";
import { TIME_COPY } from "@/lib/time/strings";

export type InstallPrompt = {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Platform = "ios" | "android" | "other";

const copy = TIME_COPY.en;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

function ShareIcon() {
  return (
    <svg
      className="time-install-icon"
      viewBox="0 0 64 64"
      role="img"
      aria-label="iPhone Share icon"
    >
      <path d="M32 7v31M21 18 32 7l11 11" />
      <path d="M20 25H14a5 5 0 0 0-5 5v22a5 5 0 0 0 5 5h36a5 5 0 0 0 5-5V30a5 5 0 0 0-5-5h-6" />
    </svg>
  );
}

function AddToHomeIcon() {
  return (
    <svg
      className="time-install-icon"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Add to Home Screen icon"
    >
      <rect x="8" y="8" width="48" height="48" rx="11" />
      <path d="M32 20v24M20 32h24" />
    </svg>
  );
}

function HomeScreenIcon() {
  return (
    <div className="time-install-app-icon" aria-label="Party Perfect Time app icon">
      <img src="/party-perfect-logo.png" alt="" />
      <span>TIME</span>
    </div>
  );
}

function LocationPrivacyStep({ onDone }: { onDone: () => void }) {
  return (
    <>
      <p className="time-install-kicker">LOCATION & PRIVACY</p>
      <h1>Location only when you punch.</h1>
      <p>{copy.locationPrivacy}</p>
      <p>{copy.locationPrivacyPrinciple}</p>
      <p className="time-muted">
        You will be asked for location when you clock in, start/end lunch, or clock out.
      </p>
      <button className="time-btn time-btn-primary time-install-main" type="button" onClick={onDone}>
        GOT IT
      </button>
    </>
  );
}

export function InstallOnboarding({
  open,
  installPrompt,
  onClose,
}: {
  open: boolean;
  installPrompt: InstallPrompt | null;
  onClose: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>("other");
  const [step, setStep] = useState(0);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  const shouldShow = open && !isStandalone() && (platform === "ios" || platform === "android");
  const totalSteps = platform === "ios" ? 4 : installPrompt ? 2 : 4;
  const progress = useMemo(
    () => (step === 0 ? 0 : Math.min(100, (step / totalSteps) * 100)),
    [step, totalSteps],
  );

  if (!shouldShow) return null;

  const installAndroid = async () => {
    if (!installPrompt) {
      setStep(1);
      return;
    }
    setInstalling(true);
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice?.catch(() => null);
    setInstalling(false);
    if (!choice || choice.outcome === "accepted") setStep(totalSteps);
    else setStep(1);
  };

  let body: React.ReactNode;
  if (step === 0) {
    body = (
      <>
        <HomeScreenIcon />
        <p className="time-install-kicker">PARTY PERFECT TIME</p>
        <h1>Let&apos;s add Time to your phone.</h1>
        <p>This only takes a few seconds.</p>
        <p className="time-muted">{copy.locationPrivacy}</p>
        <button
          className="time-btn time-btn-primary time-install-main"
          type="button"
          onClick={() => (platform === "android" && installPrompt ? void installAndroid() : setStep(1))}
          disabled={installing}
        >
          {platform === "android" && installPrompt
            ? installing
              ? "OPENING INSTALL…"
              : "INSTALL PARTY PERFECT TIME"
            : "CONTINUE"}
        </button>
      </>
    );
  } else if (step === totalSteps) {
    body = <LocationPrivacyStep onDone={onClose} />;
  } else if (platform === "ios" && step === 1) {
    body = (
      <>
        <ShareIcon />
        <p className="time-install-kicker">STEP 1 OF 3</p>
        <h1>Tap the Share button in Safari.</h1>
        <p>Look for this icon in Safari. Its position can vary.</p>
        <button className="time-btn time-btn-primary time-install-main" type="button" onClick={() => setStep(2)}>
          NEXT
        </button>
      </>
    );
  } else if (platform === "ios" && step === 2) {
    body = (
      <>
        <AddToHomeIcon />
        <p className="time-install-kicker">STEP 2 OF 3</p>
        <h1>Scroll down and tap:</h1>
        <div className="time-install-menu-row">
          <AddToHomeIcon />
          <strong>Add to Home Screen</strong>
        </div>
        <button className="time-btn time-btn-primary time-install-main" type="button" onClick={() => setStep(3)}>
          NEXT
        </button>
      </>
    );
  } else if (platform === "ios" && step === 3) {
    body = (
      <>
        <HomeScreenIcon />
        <p className="time-install-kicker">STEP 3 OF 3</p>
        <h1>Tap Add.</h1>
        <p>Party Perfect Time will now be on your Home Screen.</p>
        <button className="time-btn time-btn-primary time-install-main" type="button" onClick={() => setStep(4)}>
          NEXT
        </button>
      </>
    );
  } else if (step === 1) {
    body = (
      <>
        <ShareIcon />
        <p className="time-install-kicker">STEP 1 OF 3</p>
        <h1>Open your browser menu.</h1>
        <p>Tap the three-dot menu in Chrome.</p>
        <button className="time-btn time-btn-primary time-install-main" type="button" onClick={() => setStep(2)}>
          NEXT
        </button>
      </>
    );
  } else if (step === 2) {
    body = (
      <>
        <AddToHomeIcon />
        <p className="time-install-kicker">STEP 2 OF 3</p>
        <h1>Tap Add to Home screen.</h1>
        <p>You may see “Install app” instead. Either one works.</p>
        <button className="time-btn time-btn-primary time-install-main" type="button" onClick={() => setStep(3)}>
          NEXT
        </button>
      </>
    );
  } else {
    body = (
      <>
        <HomeScreenIcon />
        <p className="time-install-kicker">STEP 3 OF 3</p>
        <h1>Confirm the install.</h1>
        <p>Party Perfect Time will appear with your other apps.</p>
        <button className="time-btn time-btn-primary time-install-main" type="button" onClick={() => setStep(4)}>
          NEXT
        </button>
      </>
    );
  }

  return (
    <div className="time-install" role="dialog" aria-modal="true" aria-label="Install Party Perfect Time">
      <div className="time-install-card">
        <img className="time-install-logo" src="/party-perfect-logo.png" alt="Party Perfect Event Rental & Design" />
        {step > 0 ? (
          <div className="time-install-progress" aria-label={`${step} of ${totalSteps}`}>
            <div style={{ width: `${progress}%` }} />
          </div>
        ) : null}
        <div className="time-install-content" key={`${platform}-${step}`}>
          {body}
        </div>
        {step > 0 ? (
          <button className="time-install-back" type="button" onClick={() => setStep(Math.max(0, step - 1))}>
            Back
          </button>
        ) : null}
      </div>
    </div>
  );
}
