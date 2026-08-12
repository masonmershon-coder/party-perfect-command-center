#!/usr/bin/env node
/**
 * Smoke test: real charger in generated garden scene (Bria product-shot).
 * Usage: node --env-file=.env.local scripts/test-madison-product-scene.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i);
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const FAL_KEY =
  process.env.FAL_KEY ||
  process.env.FAL_API_KEY ||
  process.env.madisonpplflux ||
  process.env.adisonpplflux;

if (!FAL_KEY) {
  console.error("FAL_KEY not set — skip live generation.");
  process.exit(1);
}

const SITE = "https://www.partyperfecteventrental.com";
const home = await fetch(`${SITE}/equipment.asp`, {
  headers: { "User-Agent": "PartyPerfectDesignTest/1.0" },
}).then((r) => r.text());

const chargerMatch =
  home.match(
    /href='equipment[^']*key=([^']+)'[^>]*>\s*<img[^>]+alt='([^']*charger[^']*)'[^>]+src='([^']+)'/i,
  ) ||
  home.match(
    /href='equipment[^']*key=([^']+)'[^>]*>\s*<img[^>]+src='([^']+charger[^']*)'[^>]+alt='([^']*)'/i,
  );

let productUrl = "";
let productName = "gold charger";

if (chargerMatch) {
  productName = chargerMatch[2] || chargerMatch[3] || productName;
  const src = chargerMatch[3] || chargerMatch[2];
  productUrl = src.startsWith("http")
    ? src
    : `${SITE}/${src.replace(/^\//, "")}`;
} else {
  const any = home.match(/src='(\/itemimages\/[^']+)'/i);
  if (any) productUrl = `${SITE}${any[1]}`;
}

if (!productUrl) {
  console.error("Could not find a charger/product image on the website.");
  process.exit(1);
}

console.log("Product anchor:", productName);
console.log("Product URL:", productUrl);

const scene =
  "elegant garden wedding reception tablescape, white linen, soft golden hour Tulsa Oklahoma, photoreal event rental photo";

const res = await fetch("https://fal.run/fal-ai/bria/product-shot", {
  method: "POST",
  headers: {
    Authorization: `Key ${FAL_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    image_url: productUrl,
    scene_description: scene,
    fast: true,
    optimize_description: true,
    num_results: 1,
    placement_type: "automatic",
  }),
});

const payload = await res.json();
if (!res.ok) {
  console.error("FAL error:", JSON.stringify(payload).slice(0, 500));
  process.exit(1);
}

const out =
  payload.images?.[0]?.url || payload.image?.url || payload.data?.images?.[0]?.url;
console.log("\nSample output (real product in generated scene):");
console.log(out || JSON.stringify(payload, null, 2));
