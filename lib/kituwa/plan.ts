import type { KituwaPlanStep, KituwaProject } from "@/lib/kituwa/types";

const PROJECTS: Array<{ id: string; name: string; match: RegExp }> = [
  { id: "integrity-customs", name: "Integrity Customs", match: /integrity\s+customs/i },
  { id: "party-perfect", name: "Party Perfect", match: /party\s*perfect/i },
  { id: "kituwa", name: "Kituwa", match: /\bkituwa\b/i },
  { id: "jeep", name: "Jeep", match: /\bjeep\b/i },
  { id: "home-lab", name: "Home Lab", match: /home\s*lab/i },
];

export function inferProject(text: string): KituwaProject {
  for (const p of PROJECTS) {
    if (p.match.test(text)) {
      return { id: p.id, name: p.name, inferred: true, confidence: "high" };
    }
  }
  return {
    id: "unspecified",
    name: "Unspecified",
    inferred: false,
    confidence: "low",
  };
}

export type DerivedWork = {
  category: string;
  title: string;
  hat: string;
  capabilities: Record<string, number | boolean>;
  protected: string[];
};

export function deriveWorkItems(text: string): DerivedWork[] {
  const t = text.toLowerCase();
  const items: DerivedWork[] = [];
  if (/email/.test(t) && /automat/.test(t)) {
    items.push({
      category: "automation",
      title: "Scope incoming email automation",
      hat: "AUTOMATION",
      capabilities: { reasoning: 0.5 },
      protected: [],
    });
  } else if (/email/.test(t)) {
    items.push({
      category: "research",
      title: "Understand email workflow",
      hat: "RESEARCH",
      capabilities: { research: 0.4 },
      protected: [],
    });
  }
  if (/checkout|cart|payment/.test(t)) {
    items.push({
      category: "build",
      title: "Scope website checkout improvements",
      hat: "BUILD",
      capabilities: { coding: 0.5, reasoning: 0.4 },
      protected: [],
    });
  }
  if (/convert|conversion|customers aren't|not converting/.test(t)) {
    items.push({
      category: "research",
      title: "Diagnose conversion gaps",
      hat: "ANALYSIS",
      capabilities: { research: 0.5, reasoning: 0.4 },
      protected: [],
    });
  }
  if (!items.length) {
    items.push({
      category: "planning",
      title: "Clarify what Matter should do next",
      hat: "PLANNING",
      capabilities: { reasoning: 0.3 },
      protected: [],
    });
  }
  items.push({
    category: "verification",
    title: "Independent verification when work exists",
    hat: "VERIFY",
    capabilities: { verification: 0.5 },
    protected: [],
  });
  return items;
}

export function initialPlan(text: string, project: KituwaProject): KituwaPlanStep[] {
  const work = deriveWorkItems(text);
  const steps: KituwaPlanStep[] = [
    { id: "understand", label: "Understand request", status: "done" },
    {
      id: "project",
      label: project.confidence === "high" ? `Identify project: ${project.name}` : "Identify project context",
      status: project.confidence === "high" ? "done" : "waiting",
      detail:
        project.confidence === "high"
          ? undefined
          : "Matter inferred no named project. Say the client or project when you want it pinned.",
    },
    { id: "persist", label: "Persist request and tasks", status: "done" },
  ];
  for (const item of work.filter((w) => w.category !== "verification")) {
    steps.push({
      id: `work-${item.category}-${item.title.slice(0, 24)}`,
      label: item.title,
      status: "pending",
    });
  }
  steps.push({
    id: "verify",
    label: "Independent verification",
    status: "pending",
    detail: "Required before any consequential delivery. Not started.",
  });
  steps.push({
    id: "delivery",
    label: "Prepare delivery",
    status: "pending",
    detail: "No deploy, spend, or client send without approval.",
  });
  return steps;
}
