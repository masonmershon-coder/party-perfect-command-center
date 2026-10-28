#!/usr/bin/env python3
"""Paint the four Matter identity studies. Browser mockups, not an iOS simulator."""
from pathlib import Path

OUT = Path(__file__).resolve().parent / "Studies"
OUT.mkdir(exist_ok=True)

FLAME = "M17.7 3.8 C26.5 15.2 31.3 31.9 23.8 47.1 C19.7 59.3 19 69.9 17 73 C13.6 68.4 6.1 56.2 10.2 44.1 C13.6 30.4 12.2 12.2 17.7 3.8 Z"

MIC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>'


def wick_icon(ash=False):
    flame = "#8A8178" if ash else "#E7B089"
    core = "#A79C93" if ash else "#FBE2C7"
    glow = "rgba(138,129,120,.25)" if ash else "rgba(231,176,137,.55)"
    return f'''<svg viewBox="0 0 512 512" width="100%" height="100%">
      <rect width="512" height="512" rx="114" fill="#100E0C"/>
      <circle cx="256" cy="268" r="120" fill="{glow}"/>
      <ellipse cx="256" cy="392" rx="78" ry="12" fill="{glow}"/>
      <g transform="translate(201,168) scale(3.15)">
        <path d="{FLAME}" fill="{flame}"/>
        <circle cx="17" cy="16" r="3.2" fill="{core}"/>
      </g>
    </svg>'''


def monolith_icon(dim=False):
    hi = "#9AA1A8" if dim else "#F4F6F8"
    mid = "#5C636A" if dim else "#A7B0B8"
    lo = "#1A1D21" if dim else "#2A3036"
    gid = "metalDim" if dim else "metal"
    return f'''<svg viewBox="0 0 512 512" width="100%" height="100%">
      <rect width="512" height="512" rx="114" fill="#090A0C"/>
      <defs>
        <linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="{hi}"/>
          <stop offset="0.22" stop-color="{mid}"/>
          <stop offset="1" stop-color="{lo}"/>
        </linearGradient>
      </defs>
      <rect x="206" y="78" width="100" height="356" rx="4" fill="url(#{gid})"/>
      <rect x="206" y="78" width="100" height="2" fill="#ffffff" opacity="0.85"/>
    </svg>'''


def signal_icon(dim=False):
    stroke = "#3E5560" if dim else "#7EB4CC"
    return f'''<svg viewBox="0 0 512 512" width="100%" height="100%">
      <rect width="512" height="512" rx="114" fill="#05070A"/>
      <path d="M78 300 C 150 300, 168 150, 248 150 C 328 150, 346 392, 434 250" fill="none" stroke="{stroke}" stroke-width="22" stroke-linecap="round"/>
      <circle cx="248" cy="150" r="10" fill="#E7EEF2" opacity="{0.35 if dim else 1}"/>
    </svg>'''


def archive_icon(dim=False):
    ring = "#6E5A3E" if dim else "#C4A574"
    inner = "#4A3E2E" if dim else "#8C7355"
    return f'''<svg viewBox="0 0 512 512" width="100%" height="100%">
      <rect width="512" height="512" rx="114" fill="#0C0B09"/>
      <circle cx="256" cy="256" r="158" fill="none" stroke="{ring}" stroke-width="14"/>
      <circle cx="256" cy="256" r="124" fill="none" stroke="{inner}" stroke-width="3"/>
      <path d="M166 292 L256 176 L346 292" fill="none" stroke="{ring}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M176 334 H336" fill="none" stroke="{ring}" stroke-width="16" stroke-linecap="round"/>
    </svg>'''


ICONS = {
    "wick": wick_icon,
    "monolith": monolith_icon,
    "signal": signal_icon,
    "archive": archive_icon,
}

BASE = '''
* { box-sizing: border-box; }
html, body { margin: 0; background: #161616; color: #eee; }
.board { display: flex; gap: 18px; padding: 18px; width: max-content; }
.meta { width: 280px; }
.meta h1 { font: 500 22px/1.2 Georgia, serif; margin: 0 0 6px; }
.meta .emo { font: 14px/1.45 Helvetica, Arial, sans-serif; color: #c8c8c8; min-height: 64px; }
.icon { width: 168px; height: 168px; margin: 12px 0; }
.homes { display: flex; gap: 18px; align-items: flex-end; margin: 8px 0 16px; }
.hs { width: 86px; text-align: center; }
.hs .glyph { width: 62px; height: 62px; margin: 0 auto 6px; }
.hs span { font: 11px/1 Helvetica, Arial, sans-serif; color: #ddd; }
.swatch { display: flex; align-items: center; gap: 8px; font: 12px/1.4 ui-monospace, Menlo, monospace; margin: 3px 0; }
.chip { width: 18px; height: 18px; border-radius: 3px; border: 1px solid rgba(255,255,255,.2); }
.note { font: 12px/1.4 Helvetica, Arial, sans-serif; color: #bbb; margin-top: 8px; }
.col { width: 390px; }
.cap { font: 11px/1 Helvetica, Arial, sans-serif; letter-spacing: .14em; color: #9a9a9a; margin: 0 0 8px; }
.phone { width: 390px; height: 844px; overflow: hidden; position: relative; display: flex; flex-direction: column; }
.sample { font: 11px/1.3 Helvetica, Arial, sans-serif; letter-spacing: .04em; opacity: .8; }
.compare { display: flex; gap: 28px; padding: 28px; width: max-content; align-items: flex-start; }
.compare h2 { font: 500 16px/1.2 Helvetica, Arial, sans-serif; margin: 0 0 12px; letter-spacing: .08em; }
.bigicon { width: 220px; height: 220px; }
'''


def phone_wick(kind):
    if kind == "chat":
        return f'''<div class="phone" style="background:#100E0C;color:#F3EDE4;font-family:Georgia,serif">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:22px 20px 0">
            <div style="font-size:22px">Matter</div><div style="font:16px Helvetica,Arial,sans-serif">Owner</div>
          </div>
          <div style="height:150px;display:flex;align-items:center;justify-content:center;position:relative">
            <div style="position:absolute;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(231,176,137,.5),transparent 68%)"></div>
            <svg width="42" height="96" viewBox="0 0 34 76"><path d="{FLAME}" fill="#E7B089"/><circle cx="17" cy="16" r="3" fill="#FBE2C7"/></svg>
          </div>
          <div style="text-align:center;font-size:17px">Here</div>
          <div class="sample" style="text-align:center;color:#B7A99A;padding:6px 24px 0">Sample dialogue. Not a live reply.</div>
          <div style="padding:22px 20px;font:17px/1.45 Helvetica,Arial,sans-serif">
            <div style="text-align:right;color:#B7A99A;font-size:12px">You</div>
            <div style="margin-left:64px;background:#1C1916;border-radius:18px;padding:12px 14px">Is the porch light still on?</div>
            <div style="color:#B7A99A;font-size:12px;margin-top:18px">Matter</div>
            <div style="border-left:2px solid #E7B089;padding-left:12px">Yes. It has been on since dusk. I can turn it off when you say so.</div>
          </div>
          <div style="margin-top:auto;padding:12px 16px 22px">
            <div style="display:flex;align-items:center;gap:8px;background:#1C1916;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:8px 12px;color:#F3EDE4">
              {MIC}<span style="flex:1;color:#B7A99A;font:17px Helvetica,Arial,sans-serif">Message Matter</span>
              <span style="width:32px;height:32px;border-radius:50%;background:#2A2522;color:#8A8178;display:flex;align-items:center;justify-content:center">↑</span>
            </div>
          </div>
        </div>'''
    if kind == "family":
        return '''<div class="phone" style="background:#100E0C;color:#F3EDE4;font-family:Helvetica,Arial,sans-serif">
          <div style="display:flex;justify-content:space-between;padding:22px 20px 8px;font-family:Georgia,serif;font-size:22px"><span>Household</span><span style="font:16px Helvetica,Arial,sans-serif">Home</span></div>
          <div class="sample" style="color:#B7A99A;padding:0 20px 12px">Fictional sample household. Not the Mershon family.</div>
          ''' + "".join(
            f'''<div style="display:flex;gap:12px;align-items:center;padding:10px 20px">
              <div style="width:36px;height:36px;border-radius:50%;border:1px solid #E7B089;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif">{n[0]}</div>
              <div><b style="font-weight:500">{n}</b><div style="color:#B7A99A;font-size:13px">{a} · Home</div></div>
            </div>'''
            for n, a in [("Mara Ellison", "Harbor"), ("Caleb Orth", "Field"), ("June Pell", "Clerk")]
        ) + '''<div style="margin:16px 20px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);color:#B7A99A;font-size:14px">Work stays in its own room.</div>
        </div>'''
    return '''<div class="phone" style="background:#100E0C;color:#F3EDE4;font-family:Helvetica,Arial,sans-serif">
      <div style="padding:22px 20px 4px;font-family:Georgia,serif;font-size:22px">Owner</div>
      <div class="sample" style="color:#D6B483;padding:0 20px 16px">Sample data. Not a live supervisor.</div>
      ''' + "".join(
        f'''<div style="padding:8px 20px 14px"><div style="color:#B7A99A;font-size:12px;letter-spacing:.08em">{k.upper()}</div><div style="font-size:17px;margin-top:4px">{v}</div></div>'''
        for k, v in [
            ("Core", "No live health in this study"),
            ("Local intelligence", "Not observed"),
            ("Devices", "Porch, kitchen — sample names only"),
            ("Approval", "One sample waiting. Not a real request."),
            ("Agents", "Harbor, Field, Clerk — names only"),
        ]
    ) + "</div>"


def phone_monolith(kind):
    rule = "border-top:1px solid rgba(255,255,255,.14)"
    if kind == "chat":
        return f'''<div class="phone" style="background:#090A0C;color:#E8EDF2;font-family:Helvetica,Arial,sans-serif">
          <div style="display:flex;align-items:center;gap:14px;padding:26px 22px 18px">
            <div style="width:14px;height:52px;background:linear-gradient(90deg,#F4F6F8,#8B949C 30%,#2A3036);box-shadow:inset 0 1px 0 #fff"></div>
            <div><div style="letter-spacing:.22em;font-size:13px">MATTER</div><div style="color:#8E969E;font-size:15px;margin-top:4px">Standby</div></div>
          </div>
          <div class="sample" style="color:#8E969E;padding:0 22px 8px">Sample dialogue. Not a live reply.</div>
          <div style="{rule};margin:8px 22px 0;padding:16px 0">
            <div style="color:#8E969E;font-size:12px;letter-spacing:.14em">YOU</div>
            <div style="font-size:18px;margin-top:6px">Is the porch light still on?</div>
          </div>
          <div style="{rule};margin:0 22px;padding:16px 0">
            <div style="color:#8E969E;font-size:12px;letter-spacing:.14em">MATTER</div>
            <div style="font-size:18px;margin-top:6px;max-width:320px">Yes. It has been on since dusk. I can turn it off when you say so.</div>
          </div>
          <div style="margin-top:auto;padding:16px 18px 22px">
            <div style="display:flex;align-items:center;gap:10px;background:#141618;border:1px solid rgba(255,255,255,.16);padding:10px 12px">
              {MIC}<span style="flex:1;color:#8E969E;font-size:17px">Speak or write</span>
              <span style="width:36px;height:36px;border:1px solid #C5CBD1;display:flex;align-items:center;justify-content:center">↑</span>
            </div>
          </div>
        </div>'''
    if kind == "family":
        rows = "".join(
            f'''<div style="display:grid;grid-template-columns:36px 1fr auto;gap:10px;padding:14px 0;border-top:1px solid rgba(255,255,255,.14)">
              <div style="color:#8E969E">{i}</div>
              <div><div style="font-size:17px">{n}</div><div style="color:#8E969E;font-size:13px">{a}</div></div>
              <div style="letter-spacing:.12em;font-size:12px;color:#C5CBD1">{s}</div>
            </div>'''
            for i, n, a, s in [("01", "Mara Ellison", "Harbor", "HOME"), ("02", "Caleb Orth", "Field", "HOME"), ("03", "June Pell", "Clerk", "HOME"), ("04", "N. Calder", "Ledger", "WORK")]
        )
        return f'''<div class="phone" style="background:#090A0C;color:#E8EDF2;font-family:Helvetica,Arial,sans-serif;padding:26px 22px">
          <div style="letter-spacing:.2em;font-size:13px">HOUSE</div>
          <div class="sample" style="color:#8E969E;margin:8px 0 12px">Fictional sample household. Not the Mershon family.</div>
          {rows}
        </div>'''
    cells = "".join(
        f'''<div style="padding:16px;border:1px solid rgba(255,255,255,.14)">
          <div style="color:#8E969E;font-size:11px;letter-spacing:.14em">{k}</div>
          <div style="font-size:16px;margin-top:8px">{v}</div>
        </div>'''
        for k, v in [("CORE", "Not live"), ("LOCAL", "Not observed"), ("DEVICES", "2 sample names"), ("APPROVALS", "1 sample")]
    )
    return f'''<div class="phone" style="background:#090A0C;color:#E8EDF2;font-family:Helvetica,Arial,sans-serif;padding:26px 18px">
      <div style="letter-spacing:.2em;font-size:13px">CONDITION</div>
      <div class="sample" style="color:#C5CBD1;margin:8px 0 14px">Sample data. Not a live supervisor.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">{cells}</div>
    </div>'''


def phone_signal(kind):
    wave = '<svg width="100%" height="54" viewBox="0 0 360 54" preserveAspectRatio="none"><path d="M0 36 C 40 36, 60 8, 100 8 C 140 8, 160 48, 210 28 C 250 12, 280 40, 360 22" fill="none" stroke="#7EB4CC" stroke-width="1.6"/></svg>'
    if kind == "chat":
        return f'''<div class="phone" style="background:#05070A;color:#E7EEF2;font-family:Helvetica,Arial,sans-serif">
          <div style="padding:22px 20px 0;display:flex;justify-content:space-between;align-items:baseline">
            <div style="letter-spacing:.18em;font-size:14px">MATTER</div><div style="color:#7EB4CC;font-size:14px">Quiet</div>
          </div>
          <div style="padding:10px 16px 0">{wave}</div>
          <div class="sample" style="color:#8AA0AA;padding:8px 20px 0">Sample dialogue. Not a live reply.</div>
          <div style="padding:20px">
            <div style="display:flex;gap:10px;align-items:flex-start">
              <div style="width:6px;height:6px;border-radius:50%;background:#7EB4CC;margin-top:8px"></div>
              <div style="color:#8AA0AA;font-size:13px">You</div>
            </div>
            <div style="font-size:18px;padding:4px 0 16px 16px">Is the porch light still on?</div>
            <div style="display:flex;gap:10px"><div style="width:6px;height:6px;border-radius:50%;background:#E7EEF2;margin-top:8px"></div><div style="color:#8AA0AA;font-size:13px">Matter</div></div>
            <div style="font-size:18px;padding:4px 0 0 16px">Yes. It has been on since dusk. I can turn it off when you say so.</div>
          </div>
          <div style="margin-top:auto;padding:12px 16px 22px">
            <div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid #7EB4CC;padding:8px 0;color:#E7EEF2">
              {MIC}<span style="flex:1;color:#8AA0AA;font-size:17px">Speak into the link</span><span>↑</span>
            </div>
          </div>
        </div>'''
    if kind == "family":
        def node(n, a, scope):
            return f'''<div style="display:flex;gap:12px;padding:8px 0">
              <div style="width:10px;height:10px;border-radius:50%;border:1px solid #7EB4CC;margin-top:6px"></div>
              <div><div style="font-size:17px">{n}</div><div style="color:#8AA0AA;font-size:13px">{a} · {scope}</div></div>
            </div>'''
        return f'''<div class="phone" style="background:#05070A;color:#E7EEF2;font-family:Helvetica,Arial,sans-serif;padding:24px 20px">
          <div style="letter-spacing:.16em;font-size:14px">LINKED</div>
          <div class="sample" style="color:#8AA0AA;margin:8px 0 12px">Fictional sample household. Not the Mershon family.</div>
          <div style="color:#7EB4CC;font-size:12px;letter-spacing:.12em;margin-bottom:6px">HOME</div>
          {node("Mara Ellison","Harbor","Home")}{node("Caleb Orth","Field","Home")}{node("June Pell","Clerk","Home")}
          <div style="color:#7EB4CC;font-size:12px;letter-spacing:.12em;margin:14px 0 6px">WORK</div>
          {node("N. Calder","Ledger","Work")}
        </div>'''
    rows = "".join(
        f'''<div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid rgba(126,180,204,.25)">
          <div style="font-size:16px">{k}</div><div style="color:#8AA0AA;font-size:14px;text-align:right">{v}</div></div>'''
        for k, v in [
            ("Core", "Not live"),
            ("Local intelligence", "Not observed"),
            ("Porch light", "Sample device"),
            ("Kitchen", "Sample device"),
            ("Approval", "Sample only"),
        ]
    )
    return f'''<div class="phone" style="background:#05070A;color:#E7EEF2;font-family:Helvetica,Arial,sans-serif;padding:24px 20px">
      <div style="letter-spacing:.16em;font-size:14px">FIELD</div>
      <div class="sample" style="color:#7EB4CC;margin:8px 0 10px">Sample data. Not a live supervisor.</div>
      {rows}
    </div>'''


def phone_archive(kind):
    frame = "margin:14px;border:1px solid #8C7355;outline:1px solid #3A3128;outline-offset:4px;height:calc(100% - 28px);display:flex;flex-direction:column;padding:18px 16px"
    if kind == "chat":
        return f'''<div class="phone" style="background:#0C0B09;color:#E7DCC8">
          <div style="{frame}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <svg width="36" height="36" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="none" stroke="#C4A574" stroke-width="1.6"/><path d="M18 38 L32 20 L46 38" fill="none" stroke="#C4A574" stroke-width="1.6"/><path d="M20 44 H44" stroke="#C4A574" stroke-width="1.6"/></svg>
              <div style="font:12px Helvetica,Arial,sans-serif;letter-spacing:.16em;color:#C4A574">CORRESPONDENCE</div>
            </div>
            <div style="font:15px Georgia,serif;margin-top:16px">At rest</div>
            <div class="sample" style="color:#8C7355;margin-top:4px">Sample dialogue. Not a live reply.</div>
            <div style="margin-top:22px;font:18px/1.45 Georgia,serif">Is the porch light still on?</div>
            <div style="height:1px;background:#8C7355;margin:16px 0"></div>
            <div style="font:18px/1.5 Georgia,serif">Yes. It has been on since dusk. I can turn it off when you say so.</div>
            <div style="margin-top:auto;display:flex;align-items:center;gap:8px;border-bottom:1px solid #C4A574;padding-bottom:8px;color:#E7DCC8">
              {MIC}<span style="flex:1;font:16px Helvetica,Arial,sans-serif;color:#8C7355">Write to Matter</span><span>↗</span>
            </div>
          </div>
        </div>'''
    if kind == "family":
        lines = "".join(
            f'''<div style="padding:10px 0;border-bottom:1px solid #3A3128">
              <div style="font:18px Georgia,serif">{n}</div>
              <div style="font:12px Helvetica,Arial,sans-serif;letter-spacing:.12em;color:#C4A574;margin-top:3px">{a} · {s}</div>
            </div>'''
            for n, a, s in [("Mara Ellison", "HARBOR", "HOUSEHOLD"), ("Caleb Orth", "FIELD", "HOUSEHOLD"), ("June Pell", "CLERK", "HOUSEHOLD"), ("N. Calder", "LEDGER", "PRACTICE")]
        )
        return f'''<div class="phone" style="background:#0C0B09;color:#E7DCC8">
          <div style="{frame}">
            <div style="font:12px Helvetica,Arial,sans-serif;letter-spacing:.18em;color:#C4A574">REGISTER</div>
            <div class="sample" style="color:#8C7355;margin:8px 0 12px">Fictional sample household. Not the Mershon family.</div>
            {lines}
          </div>
        </div>'''
    rows = "".join(
        f'''<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #3A3128;font:15px Georgia,serif">
          <span>{k}</span><span style="color:#C4A574;font:13px Helvetica,Arial,sans-serif">{v}</span></div>'''
        for k, v in [("Core", "Not live"), ("Local mind", "Not observed"), ("Devices", "Two sample names"), ("Waiting", "One sample"), ("Agents", "Names only")]
    )
    return f'''<div class="phone" style="background:#0C0B09;color:#E7DCC8">
      <div style="{frame}">
        <div style="font:12px Helvetica,Arial,sans-serif;letter-spacing:.18em;color:#C4A574">RECORD OF CONDITION</div>
        <div class="sample" style="color:#C4A574;margin:8px 0 12px">Sample data. Not a live supervisor.</div>
        {rows}
      </div>
    </div>'''


PHONES = {
    "wick": phone_wick,
    "monolith": phone_monolith,
    "signal": phone_signal,
    "archive": phone_archive,
}

META = {
    "wick": {
        "title": "01 — The Wick",
        "emo": "A light left on for the people in the house. Intimate, warm, and quiet.",
        "type": "Serif for the name and the state. System sans for conversation, so a child can read it.",
        "motion": "One four-second breath. Waiting and offline hold still. Reduce Motion removes the breath.",
        "iconog": "A single flame. No face, no bubble, no letters on the icon.",
        "swatches": [("#100E0C", "Ground"), ("#1C1916", "Raised"), ("#F3EDE4", "Ivory"), ("#E7B089", "Flame"), ("#D6B483", "Gold"), ("#B7A99A", "Muted")],
    },
    "monolith": {
        "title": "02 — The Monolith",
        "emo": "A machined instrument. Precise, cool, and certain. It does not perform warmth.",
        "type": "Sans only. Wide tracking on labels. Large, plain sentences. No serif.",
        "motion": "A slow sheen on the metal edge, about six seconds. Reduce Motion leaves the ingot still.",
        "iconog": "A standing titanium bar. Geometry only. No flame and no wave.",
        "swatches": [("#090A0C", "Ground"), ("#141618", "Raised"), ("#E8EDF2", "Paper"), ("#C5CBD1", "Titanium"), ("#8E969E", "Graphite"), ("#F4F6F8", "Edge")],
    },
    "signal": {
        "title": "03 — The Signal",
        "emo": "The house, the work, and the machines on one quiet link.",
        "type": "Geometric sans. The wave is the mark. Text stays large and still.",
        "motion": "The trace drifts once every few seconds. It is not an equalizer and it does not strobe.",
        "iconog": "One crest and one point. Readable as a pulse at home-screen size.",
        "swatches": [("#05070A", "Ground"), ("#10161A", "Raised"), ("#E7EEF2", "Mist"), ("#7EB4CC", "Signal"), ("#8AA0AA", "Muted"), ("#1B3A46", "Deep")],
    },
    "archive": {
        "title": "04 — The Archive",
        "emo": "A private family institution. Built to be read again in twenty years.",
        "type": "Serif for names and replies. Small sans labels, letterspaced, for the plate.",
        "motion": "Almost still. The seal eases in opacity over eight seconds, or not at all if motion is reduced.",
        "iconog": "A seal: a ring, a peak, and a base. No words on the icon. Bronze on black.",
        "swatches": [("#0C0B09", "Ground"), ("#1A1612", "Plate"), ("#E7DCC8", "Ivory"), ("#C4A574", "Brass"), ("#8C7355", "Bronze"), ("#3A3128", "Rule")],
    },
}


def board(key):
    meta = META[key]
    icon = ICONS[key](False)
    dim = ICONS[key](True)
    swatches = "".join(
        f'<div class="swatch"><i class="chip" style="background:{h}"></i>{h} {name}</div>' for h, name in meta["swatches"]
    )
    phones = "".join(
        f'<div class="col"><div class="cap">{label}</div>{PHONES[key](kind)}</div>'
        for label, kind in [("CHAT", "chat"), ("FAMILY", "family"), ("OWNER", "owner")]
    )
    return f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>{BASE}</style></head><body>
      <div class="board">
        <aside class="meta">
          <h1>{meta["title"]}</h1>
          <div class="emo">{meta["emo"]}</div>
          <div class="icon">{icon}</div>
          <div class="homes">
            <div class="hs"><div class="glyph">{icon}</div><span>Matter</span></div>
            <div class="hs"><div class="glyph">{dim}</div><span>Offline</span></div>
          </div>
          {swatches}
          <p class="note">{meta["type"]}</p>
          <p class="note">{meta["motion"]}</p>
          <p class="note">{meta["iconog"]}</p>
          <p class="note">Design study. Not the iOS simulator.</p>
        </aside>
        {phones}
      </div>
    </body></html>'''


def icons_page():
    cells = []
    for key in ("wick", "monolith", "signal", "archive"):
        cells.append(
            f'''<div><h2>{META[key]["title"].upper()}</h2><div class="bigicon">{ICONS[key](False)}</div>
            <div class="hs" style="margin-top:18px"><div class="glyph">{ICONS[key](False)}</div><span>Matter</span></div></div>'''
        )
    return f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>{BASE}</style></head>
      <body><div class="compare">{"".join(cells)}</div></body></html>'''


def chats_page():
    cols = []
    for key in ("wick", "monolith", "signal", "archive"):
        cols.append(f'<div class="col"><div class="cap">{META[key]["title"].upper()}</div>{PHONES[key]("chat")}</div>')
    return f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>{BASE}</style></head>
      <body><div class="compare">{"".join(cols)}</div></body></html>'''


def main():
    files = {
        "board-wick.html": board("wick"),
        "board-monolith.html": board("monolith"),
        "board-signal.html": board("signal"),
        "board-archive.html": board("archive"),
        "icons.html": icons_page(),
        "chats.html": chats_page(),
    }
    for name, html in files.items():
        (OUT / name).write_text(html)
        print(name, len(html))


if __name__ == "__main__":
    main()
