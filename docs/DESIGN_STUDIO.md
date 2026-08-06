# Design Studio (Madison)

Sidebar tab **Design Studio** for showroom / décor team (Selina + showgirls).

## Phone flow
1. Build a **look board** — up to 8 photos/videos (multi-select)
2. Optional: pick **website inventory** pieces so looks match real rentals
3. Type a **command** → **Send to Madison** → she returns **2 looks**

## Media router (photoreal operators)
Madison keeps social/leads on Grok. For photos/videos she **scans** configured engines and picks the best fit:

| Tool | Needs | Best for |
|------|--------|----------|
| **Flux Inventory Edit** | `FAL_KEY` | Look board / catalog refs → photoreal proposals |
| **Flux Photoreal** | `FAL_KEY` | Text → photoreal when no refs |
| **Grok Imagine** | `XAI_API_KEY` | Fallback / secondary |
| **Kling Video** | `FAL_KEY` | Optional still → short motion (future UI) |

Override with `MADISON_IMAGE_ENGINE=auto|flux|xai`.

`GET /api/design/tools` — what Madison can use right now.

## APIs
- `POST /api/design/command` — multipart `command` + `files` / `videoFrames` + optional `catalogKeys`
- `GET /api/design` — board
- `GET /api/design/tools` — engine scan
- `POST /api/design/catalog` — sync website inventory photos
- `DELETE /api/design` — `{ id }`

Storage: durable JSON + private Vercel Blob when configured.

## Access
Open to employees (no owner PIN) — same as Social / Hiring.
