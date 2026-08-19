"use client";

import type { ReactNode } from "react";
import type { TowerFloorId } from "@/lib/matter/tower";

type RoomState = {
  floor: TowerFloorId;
  lit: boolean;
  busy: boolean;
  blocked: boolean;
  workerCount: number;
  tall?: boolean;
};

const TRAITS = ["coffee", "headset", "patch", "book", "belt", "disk"] as const;

function Worker({
  x,
  y,
  trait,
  busy,
  blocked,
  delay,
}: {
  x: number;
  y: number;
  trait: (typeof TRAITS)[number];
  busy: boolean;
  blocked: boolean;
  delay: number;
}) {
  return (
    <g
      className="matter-botlet"
      data-busy={busy ? "1" : "0"}
      data-blocked={blocked ? "1" : "0"}
      style={{ ["--bot-delay" as string]: `${delay}ms` }}
      transform={`translate(${x} ${y})`}
    >
      <rect className="matter-botlet-body" x="2" y="8" width="10" height="11" rx="1.2" />
      {trait === "patch" ? <rect className="matter-botlet-patch" x="7" y="10" width="5" height="4" /> : null}
      <rect className="matter-botlet-head" x="3" y="2" width="8" height="7" rx="1" />
      <rect className="matter-botlet-eye" x="4.5" y="4" width="2" height="2" />
      <rect className="matter-botlet-eye" x="8" y="4" width="2" height="2" />
      {trait === "headset" ? <path className="matter-botlet-hat" d="M3 5 H1 V8 H3" /> : null}
      {trait === "coffee" ? <rect className="matter-botlet-prop" x="12" y="12" width="3" height="4" /> : null}
      {trait === "book" ? <rect className="matter-botlet-book" x="12" y="11" width="5" height="4" /> : null}
      {trait === "belt" ? <rect className="matter-botlet-belt" x="2" y="13" width="10" height="2" /> : null}
      {trait === "disk" ? <rect className="matter-botlet-disk" x="11" y="14" width="5" height="1.5" /> : null}
      <rect className="matter-botlet-leg" x="3" y="18" width="3" height="5" />
      <rect className="matter-botlet-leg" x="8" y="18" width="3" height="5" />
    </g>
  );
}

function workersFor(count: number, lit: boolean, busy: boolean, blocked: boolean, spots: Array<[number, number]>) {
  const n = Math.min(Math.max(count, lit ? 1 : 0), spots.length);
  return spots.slice(0, n).map(([x, y], i) => (
    <Worker
      key={`${x}-${y}`}
      x={x}
      y={y}
      trait={TRAITS[i % TRAITS.length]}
      busy={busy}
      blocked={blocked}
      delay={i * 180}
    />
  ));
}

function RoomChrome({ id, tall, children }: { id: string; tall: boolean; children: ReactNode }) {
  const h = tall ? 210 : 118;
  return (
    <svg className="matter-diorama-svg" viewBox={`0 0 320 ${h}`} aria-hidden>
      <defs>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141820" />
          <stop offset="100%" stopColor="#0a0d12" />
        </linearGradient>
        <linearGradient id={`${id}-depth`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.35" />
          <stop offset="40%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1f28" />
          <stop offset="100%" stopColor="#0c1016" />
        </linearGradient>
      </defs>
      <rect fill={`url(#${id}-wall)`} width="320" height={h} />
      <polygon className="matter-room-ceiling" points={`0,0 320,0 300,18 20,18`} />
      <rect className="matter-room-beam" x="0" y="16" width="320" height="4" />
      <polygon fill={`url(#${id}-floor)`} points={`12,${h - 22} 308,${h - 22} 320,${h} 0,${h}`} />
      {children}
      <rect fill={`url(#${id}-depth)`} width="320" height={h} pointerEvents="none" />
    </svg>
  );
}

function CodexRoom({ tall, lit, busy, blocked, workerCount }: Omit<RoomState, "floor">) {
  const h = tall ? 210 : 118;
  return (
    <RoomChrome id="codex" tall={Boolean(tall)}>
      <text className="matter-plaque" x="12" y="32">OPENAI · SOFTWARE</text>
      <rect className="eq-cabinet" x="12" y={h - 70} width="28" height="48" />
      <rect className="eq-drawer" x="15" y={h - 66} width="22" height="8" />
      <rect className="eq-drawer" x="15" y={h - 55} width="22" height="8" />
      <rect className="eq-book" x="44" y={h - 52} width="7" height="18" />
      <rect className="eq-book eq-book-alt" x="52" y={h - 48} width="6" height="14" />
      <rect className="eq-desk" x="64" y={h - 42} width="72" height="8" />
      <rect className="eq-crt" x="70" y={h - 68} width="28" height="22" rx="1" />
      <rect className="eq-crt-glass" data-lit={lit ? "1" : "0"} x="73" y={h - 65} width="22" height="14" />
      <rect className="eq-keyboard" x="72" y={h - 44} width="26" height="4" />
      <rect className="eq-modern" x="104" y={h - 64} width="28" height="18" />
      <rect className="eq-modern-glass" data-busy={busy ? "1" : "0"} x="107" y={h - 61} width="22" height="12" />
      <rect className="eq-whiteboard" x="148" y="28" width="52" height="28" />
      <path className="eq-scribble" d="M154 36 h20 m-16 8 h28 m-24 7 h12" />
      <g className="eq-rack" transform={`translate(214 ${h - 78})`}>
        <rect width="36" height="56" />
        <rect className="eq-led" x="4" y="6" width="4" height="4" />
        <rect className="eq-led" x="10" y="6" width="4" height="4" />
        <rect className="eq-led eq-led-slow" x="16" y="6" width="4" height="4" />
        <rect className="eq-slot" x="4" y="16" width="28" height="6" />
        <rect className="eq-slot" x="4" y="26" width="28" height="6" />
        <rect className="eq-slot" x="4" y="36" width="28" height="6" />
      </g>
      <rect className="eq-printer" x="258" y={h - 54} width="22" height="18" />
      <rect className="eq-paper" x="262" y={h - 58} width="14" height="6" />
      <rect className="eq-floppy" x="252" y={h - 28} width="10" height="8" />
      <text className="eq-label" x="252" y={h - 18}>1998</text>
      <path className="eq-cable" d={`M98 ${h - 42} C 120 ${h - 20}, 180 ${h - 8}, 230 ${h - 22}`} />
      {workersFor(workerCount, lit, busy, blocked, [
        [78, h - 64],
        [112, h - 64],
        [168, h - 52],
        [236, h - 58],
      ])}
    </RoomChrome>
  );
}

function ClaudeRoom({ tall, lit, busy, blocked, workerCount }: Omit<RoomState, "floor">) {
  const h = tall ? 210 : 118;
  return (
    <RoomChrome id="claude" tall={Boolean(tall)}>
      <text className="matter-plaque" x="12" y="32">ANTHROPIC · ARCHIVE</text>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${12 + i * 22} ${h - 74})`}>
          <rect className="eq-cabinet eq-warm" width="20" height="52" />
          <rect className="eq-drawer" x="2" y="6" width="16" height="7" />
          <rect className="eq-drawer" x="2" y="16" width="16" height="7" />
          <rect className="eq-drawer" x="2" y="26" width="16" height="7" />
          <rect className="eq-drawer" x="2" y="36" width="16" height="7" />
        </g>
      ))}
      <g transform={`translate(108 ${h - 86})`}>
        <rect className="eq-shelf" width="70" height="64" />
        <rect className="eq-book" x="4" y="8" width="5" height="16" />
        <rect className="eq-book eq-book-alt" x="10" y="6" width="5" height="18" />
        <rect className="eq-book" x="16" y="10" width="4" height="14" />
        <rect className="eq-book eq-book-alt" x="22" y="7" width="6" height="17" />
        <rect className="eq-book" x="4" y="34" width="6" height="14" />
        <rect className="eq-book eq-book-alt" x="12" y="32" width="5" height="16" />
        <rect className="eq-scroll" x="40" y="36" width="22" height="14" />
      </g>
      <rect className="eq-desk eq-warm" x="188" y={h - 40} width="64" height="7" />
      <rect className="eq-lamp" x="192" y={h - 62} width="6" height="22" />
      <circle className="eq-lamp-glow" cx="195" cy={h - 64} r="6" />
      <rect className="eq-paper" x="206" y={h - 48} width="18" height="10" />
      <rect className="eq-crt eq-amber" x="228" y={h - 62} width="22" height="16" />
      <rect className="eq-cork" x="260" y="28" width="48" height="36" />
      <rect className="eq-note" x="266" y="34" width="12" height="10" />
      <rect className="eq-note" x="284" y="40" width="14" height="8" />
      {workersFor(workerCount, lit, busy, blocked, [
        [198, h - 62],
        [40, h - 58],
        [130, h - 70],
        [272, h - 52],
      ])}
    </RoomChrome>
  );
}

function GrokRoom({ tall, lit, busy, blocked, workerCount }: Omit<RoomState, "floor">) {
  const h = tall ? 210 : 118;
  return (
    <RoomChrome id="grok" tall={Boolean(tall)}>
      <text className="matter-plaque" x="12" y="32">xAI · INTELLIGENCE</text>
      <rect className="eq-tv" x="14" y="28" width="36" height="24" />
      <rect className="eq-tv-glass" data-lit={lit ? "1" : "0"} x="17" y="31" width="30" height="18" />
      <rect className="eq-tv eq-tv-old" x="54" y="34" width="28" height="20" />
      <rect className="eq-tv-glass eq-tv-amber" data-lit={lit ? "1" : "0"} x="57" y="37" width="22" height="14" />
      <rect className="eq-tv" x="86" y="26" width="42" height="28" />
      <rect className="eq-tv-glass" data-busy={busy ? "1" : "0"} x="89" y="29" width="36" height="22" />
      <rect className="eq-tv eq-tv-tiny" x="132" y="38" width="18" height="14" />
      <rect className="eq-map" x="160" y="26" width="48" height="32" />
      <path className="eq-scribble" d="M168 36 h20 m-8 8 h-16 m4 7 h22" />
      <rect className="eq-radio" x="216" y="40" width="28" height="16" />
      <circle className="eq-dial" cx="236" cy="48" r="4" />
      <rect className="eq-ticker" x="12" y={h - 36} width="180" height="10" />
      <text className="eq-ticker-text" x="16" y={h - 28}>FEEDS · SOURCES · COMPARE</text>
      <rect className="eq-paper" x="200" y={h - 48} width="16" height="12" />
      <rect className="eq-paper" x="218" y={h - 46} width="14" height="10" />
      <rect className="eq-desk" x="248" y={h - 40} width="58" height="7" />
      <rect className="eq-modern" x="256" y={h - 62} width="26" height="16" />
      {workersFor(workerCount, lit, busy, blocked, [
        [40, h - 58],
        [96, h - 56],
        [168, h - 54],
        [262, h - 62],
      ])}
    </RoomChrome>
  );
}

function CursorRoom({ tall, lit, busy, blocked, workerCount }: Omit<RoomState, "floor">) {
  const h = tall ? 210 : 118;
  return (
    <RoomChrome id="cursor" tall={Boolean(tall)}>
      <text className="matter-plaque" x="12" y="32">CURSOR · ENGINEERING</text>
      <rect className="eq-bench" x="18" y={h - 44} width="140" height="10" />
      <rect className="eq-scope" x="28" y={h - 72} width="32" height="24" rx="2" />
      <path className="eq-scope-wave" d={`M34 ${h - 58} q 6 -10 12 0 t 12 0`} />
      <rect className="eq-open-pc" x="70" y={h - 70} width="40" height="22" />
      <rect className="eq-board" x="74" y={h - 66} width="14" height="10" />
      <rect className="eq-board eq-book-alt" x="90" y={h - 64} width="16" height="8" />
      <path className="eq-cable eq-cable-hot" d={`M80 ${h - 48} C 90 ${h - 20}, 130 ${h - 10}, 170 ${h - 28}`} />
      <rect className="eq-tool" x="118" y={h - 56} width="16" height="8" />
      <rect className="eq-monitor" x="168" y="30" width="40" height="26" />
      <rect className="eq-modern-glass" data-lit={lit ? "1" : "0"} x="171" y="33" width="34" height="20" />
      <rect className="eq-log" x="214" y="30" width="36" height="22" />
      <rect className="eq-rack" x="258" y={h - 78} width="30" height="52" />
      <rect className="eq-led" x="264" y={h - 70} width="4" height="4" />
      <rect className="eq-led eq-led-slow" x="272" y={h - 70} width="4" height="4" />
      {workersFor(workerCount, lit, busy, blocked, [
        [36, h - 66],
        [86, h - 66],
        [176, h - 58],
        [248, h - 58],
      ])}
    </RoomChrome>
  );
}

function LocalRoom({ tall, lit, busy, blocked, workerCount }: Omit<RoomState, "floor">) {
  const h = tall ? 210 : 118;
  return (
    <RoomChrome id="local" tall={Boolean(tall)}>
      <text className="matter-plaque" x="12" y="32">HOME LAB · MACHINE ROOM</text>
      {[0, 1, 2].map((i) => (
        <g key={i} className="eq-rack" transform={`translate(${18 + i * 44} ${h - 86})`}>
          <rect width="38" height="64" />
          <rect className="eq-slot" x="4" y="8" width="30" height="8" />
          <rect className="eq-slot" x="4" y="20" width="30" height="8" />
          <rect className="eq-slot" x="4" y="32" width="30" height="8" />
          <rect className="eq-led" x="8" y="48" width="5" height="5" />
          <rect className="eq-led eq-led-slow" x="16" y="48" width="5" height="5" />
          <circle className="eq-fan" cx="28" cy="50" r="6" />
        </g>
      ))}
      <rect className="eq-mac" x="160" y={h - 58} width="36" height="22" rx="2" />
      <rect className="eq-nas" x="204" y={h - 54} width="28" height="18" />
      <rect className="eq-ups" x="240" y={h - 50} width="22" height="14" />
      <path className="eq-cable" d={`M56 ${h - 22} H 280`} />
      <text className="eq-label" x="160" y={h - 62}>MAC NODE</text>
      {workersFor(workerCount, lit, busy, blocked, [
        [168, h - 78],
        [70, h - 70],
        [250, h - 70],
      ])}
    </RoomChrome>
  );
}

function MemoryRoom({ tall, lit, busy, blocked, workerCount }: Omit<RoomState, "floor">) {
  const h = tall ? 210 : 118;
  return (
    <RoomChrome id="memory" tall={Boolean(tall)}>
      <text className="matter-plaque" x="12" y="32">ARCHIVES · ALL ERAS</text>
      <polygon className="eq-vanish" points={`40,28 280,28 250,${h - 28} 70,${h - 28}`} />
      <rect className="eq-tape" x="48" y={h - 70} width="22" height="22" />
      <circle className="eq-reel" cx="55" cy={h - 59} r="6" />
      <circle className="eq-reel" cx="63" cy={h - 59} r="6" />
      <rect className="eq-cabinet eq-warm" x="86" y={h - 78} width="24" height="50" />
      <rect className="eq-cartridge" x="118" y={h - 48} width="16" height="10" />
      <rect className="eq-cartridge" x="136" y={h - 46} width="14" height="8" />
      <path className="eq-path" d={`M160 ${h - 40} C 190 ${h - 80}, 230 40, 270 48`} />
      <rect className="eq-vector" x="250" y="34" width="44" height="28" />
      <rect className="eq-book" x="178" y={h - 52} width="6" height="16" />
      <rect className="eq-book eq-book-alt" x="186" y={h - 50} width="5" height="14" />
      {workersFor(workerCount, lit, busy, blocked, [
        [92, h - 62],
        [160, h - 58],
        [248, h - 70],
      ])}
    </RoomChrome>
  );
}

function OutboxRoom({ tall, lit, busy, blocked, workerCount }: Omit<RoomState, "floor">) {
  const h = tall ? 210 : 118;
  return (
    <RoomChrome id="outbox" tall={Boolean(tall)}>
      <text className="matter-plaque" x="12" y="32">DELIVERY · ARTIFACTS</text>
      <rect className="eq-tube" x="20" y="30" width="14" height="40" />
      <rect className="eq-printer" x="48" y={h - 62} width="36" height="24" />
      <rect className="eq-paper" data-lit={lit ? "1" : "0"} x="54" y={h - 70} width="24" height="10" />
      <rect className="eq-conveyor" x="96" y={h - 38} width="160" height="10" />
      <rect className="eq-package" x="112" y={h - 52} width="18" height="14" />
      <rect className="eq-package eq-book-alt" x="148" y={h - 50} width="16" height="12" />
      <rect className="eq-disk" x="186" y={h - 48} width="14" height="10" />
      <rect className="eq-tray" x="268" y={h - 50} width="32" height="16" />
      {workersFor(workerCount, lit, busy, blocked, [
        [56, h - 82],
        [130, h - 70],
        [240, h - 70],
      ])}
    </RoomChrome>
  );
}

function LobbyRoom({ tall, lit, busy, blocked, workerCount }: Omit<RoomState, "floor">) {
  const h = tall ? 210 : 118;
  return (
    <RoomChrome id="lobby" tall={Boolean(tall)}>
      <text className="matter-plaque" x="12" y="32">MATTER CORE</text>
      <rect className="eq-core" x="128" y={h - 86} width="64" height="48" rx="4" />
      <rect className="eq-crt-glass" data-lit={lit ? "1" : "0"} x="140" y={h - 76} width="40" height="22" />
      {workersFor(workerCount, lit, busy, blocked, [
        [90, h - 62],
        [210, h - 62],
      ])}
    </RoomChrome>
  );
}

export function MatterDiorama(props: RoomState) {
  const room = { ...props, tall: Boolean(props.tall) };
  if (props.floor === "codex") return <CodexRoom {...room} />;
  if (props.floor === "claude") return <ClaudeRoom {...room} />;
  if (props.floor === "grok") return <GrokRoom {...room} />;
  if (props.floor === "cursor") return <CursorRoom {...room} />;
  if (props.floor === "local") return <LocalRoom {...room} />;
  if (props.floor === "memory") return <MemoryRoom {...room} />;
  if (props.floor === "outbox") return <OutboxRoom {...room} />;
  return <LobbyRoom {...room} />;
}
