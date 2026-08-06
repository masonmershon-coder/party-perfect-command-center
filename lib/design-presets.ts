import type { DesignAspectRatio } from "@/lib/types";

export const DESIGN_PRESETS: {
  id: string;
  label: string;
  prompt: string;
  aspectRatio: DesignAspectRatio;
}[] = [
  {
    id: "wedding-tablescape",
    label: "Wedding tablescape",
    prompt:
      "Photoreal luxury wedding tablescape for Party Perfect Event Rentals Tulsa: layered linens, chargers, china, crystal glassware, soft candlelight, romantic florals, elegant and boutique, showroom-quality styling",
    aspectRatio: "4:3",
  },
  {
    id: "black-gold-gala",
    label: "Black & gold gala",
    prompt:
      "Photoreal black and gold charity gala tablescape: black linens, gold chargers, tall centerpieces, dramatic warm lighting, corporate banquet elegance, Party Perfect Event Rentals Tulsa",
    aspectRatio: "16:9",
  },
  {
    id: "tent-exterior",
    label: "Tent exterior",
    prompt:
      "Photoreal white event tent exterior at golden hour in Oklahoma, string lights, landscaped venue approach, welcoming luxury party rental setup for Party Perfect Tulsa",
    aspectRatio: "16:9",
  },
  {
    id: "linen-closeup",
    label: "Linen detail",
    prompt:
      "Photoreal close-up of premium patterned event linen and napkin fold with charger edge, soft studio light, fashion-forward Party Perfect showroom style",
    aspectRatio: "1:1",
  },
  {
    id: "dance-floor",
    label: "Dance floor glow",
    prompt:
      "Photoreal polished dance floor under soft event lighting with subtle reflections, wedding reception energy, Party Perfect Event Rentals Tulsa",
    aspectRatio: "16:9",
  },
  {
    id: "ig-story",
    label: "IG story vertical",
    prompt:
      "Vertical lifestyle event rental mood board: linen textures, china, soft florals, Social Butterfly of the Event Industry vibe, Instagram story composition, Party Perfect Tulsa",
    aspectRatio: "9:16",
  },
];
