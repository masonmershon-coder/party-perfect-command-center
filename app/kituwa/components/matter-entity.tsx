"use client";

import type { MatterUiStatus } from "@/lib/kituwa/types";

function statusCopy(status: MatterUiStatus) {
  if (status === "BLOCKED") return "BLOCKED";
  if (status === "WAITING" || status === "WAITING_FOR_APPROVAL") return "WAITING";
  if (status === "LISTENING") return "LISTENING";
  if (status === "THINKING" || status === "PLANNING") return "THINKING";
  if (status === "BUILDING") return "WORKING";
  if (status === "VERIFYING") return "VERIFYING";
  if (status === "COMPLETE") return "COMPLETE";
  return "STANDBY";
}

/** Matter — scavenged-tech orchestrator. Not the Kituwa ghost. */
export function MatterEntity({ status }: { status: MatterUiStatus }) {
  const live = !["IDLE", "COMPLETE", "BLOCKED", "WAITING", "WAITING_FOR_APPROVAL"].includes(status);

  return (
    <div className="matter-entity-wrap" data-status={status} data-live={live ? "1" : "0"} aria-hidden>
      <svg className="matter-entity-svg" viewBox="0 0 220 168" role="img">
        <title>Matter</title>
        <defs>
          <linearGradient id="matter-core-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--matter-tone)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--matter-tone)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="matter-crt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#143028" />
            <stop offset="55%" stopColor="#0a1c16" />
            <stop offset="100%" stopColor="#06120e" />
          </linearGradient>
          <clipPath id="matter-visor-clip">
            <rect x="86" y="38" width="52" height="28" rx="3" />
          </clipPath>
        </defs>

        <rect className="matter-entity-chamber" x="8" y="8" width="204" height="152" rx="6" />
        <path className="matter-entity-window" d="M18 18h184v78H18z" />
        <g className="matter-entity-city" opacity="0.45">
          <rect x="28" y="52" width="10" height="44" />
          <rect x="42" y="40" width="8" height="56" />
          <rect x="54" y="58" width="14" height="38" />
          <rect x="154" y="46" width="12" height="50" />
          <rect x="170" y="36" width="8" height="60" />
          <rect x="182" y="54" width="10" height="42" />
        </g>
        <ellipse className="matter-entity-pool" cx="110" cy="148" rx="48" ry="8" />

        <g className="matter-bot">
          <path className="matter-cable" d="M64 118 C 40 128, 36 86, 52 78" />
          <path className="matter-cable matter-cable-alt" d="M156 112 C 186 122, 178 72, 164 64" />

          <rect className="matter-panel-old" x="78" y="78" width="64" height="52" rx="3" />
          <rect className="matter-panel-steel" x="118" y="82" width="22" height="30" />
          <rect className="matter-panel-copper" x="82" y="96" width="18" height="14" />
          <rect className="matter-panel-patch" x="102" y="84" width="14" height="10" />
          <circle className="matter-bolt" cx="84" cy="84" r="1.6" />
          <circle className="matter-bolt" cx="136" cy="86" r="1.6" />
          <circle className="matter-bolt" cx="84" cy="124" r="1.6" />
          <circle className="matter-bolt" cx="136" cy="124" r="1.6" />
          <circle className="matter-bolt" cx="111" cy="90" r="1.2" />
          <rect className="matter-vent" x="86" y="114" width="22" height="8" />
          <rect className="matter-vent-slot" x="88" y="116" width="18" height="1.2" />
          <rect className="matter-vent-slot" x="88" y="118.5" width="18" height="1.2" />
          <rect className="matter-chest-led" x="124" y="116" width="10" height="6" rx="1" />

          <rect className="matter-arm-old" x="62" y="86" width="16" height="8" rx="1" />
          <rect className="matter-arm-old" x="58" y="92" width="10" height="22" rx="1" />
          <rect className="matter-gripper" x="54" y="112" width="16" height="6" />
          <rect className="matter-arm-new" x="142" y="84" width="18" height="7" rx="1" />
          <rect className="matter-arm-new" x="152" y="90" width="8" height="24" rx="1" />
          <rect className="matter-sensor-wand" x="154" y="112" width="4" height="14" />

          <rect className="matter-leg" x="88" y="128" width="14" height="18" />
          <rect className="matter-leg matter-leg-new" x="118" y="128" width="12" height="18" />
          <rect className="matter-foot" x="84" y="144" width="20" height="6" />
          <rect className="matter-foot" x="114" y="144" width="18" height="6" />

          <rect className="matter-neck" x="102" y="66" width="16" height="14" />
          <rect className="matter-head-case" x="80" y="32" width="64" height="38" rx="4" />
          <rect className="matter-head-patch" x="80" y="32" width="18" height="12" />
          <circle className="matter-bolt" cx="86" cy="38" r="1.4" />
          <rect className="matter-antenna" x="70" y="18" width="4" height="22" />
          <circle className="matter-antenna-tip" cx="72" cy="16" r="3" />
          <rect className="matter-sensor-mod" x="148" y="28" width="14" height="10" rx="1" />
          <circle className="matter-sensor-lens" cx="155" cy="33" r="3" />

          <rect className="matter-visor" x="86" y="38" width="52" height="28" rx="3" />
          <g clipPath="url(#matter-visor-clip)">
            <rect className="matter-visor-fill" x="86" y="38" width="52" height="28" />
            <rect className="matter-eye" x="96" y="46" width="8" height="8" />
            <rect className="matter-eye" x="120" y="46" width="8" height="8" />
            <rect className="matter-mouth" x="104" y="58" width="16" height="3" />
            <rect className="matter-scanline" x="86" y="38" width="52" height="4" />
          </g>
          <text className="matter-face-label" x="112" y="78" textAnchor="middle">
            {statusCopy(status)}
          </text>
        </g>
      </svg>
      <span className="matter-entity-label">MATTER</span>
    </div>
  );
}
