import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const logoPath = path.join(root, "public", "party-perfect-logo.png");
const outputDir = path.join(root, "public", "time");

async function makeIcon(size, fileName, { maskable = false } = {}) {
  const horizontalPadding = maskable ? Math.round(size * 0.2) : Math.round(size * 0.12);
  const logoWidth = size - horizontalPadding * 2;
  const logo = await sharp(logoPath)
    .resize({ width: logoWidth, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const logoHeight = logoMeta.height || Math.round(size * 0.28);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 244, g: 255, b: 252, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${size}" height="${size}" rx="${maskable ? 0 : Math.round(size * 0.19)}" fill="#f4fffc"/>
            <rect x="${Math.round(size * 0.07)}" y="${Math.round(size * 0.07)}"
              width="${Math.round(size * 0.86)}" height="${Math.round(size * 0.86)}"
              rx="${Math.round(size * 0.16)}" fill="none" stroke="#00bfa5"
              stroke-width="${Math.max(3, Math.round(size * 0.025))}"/>
            <text x="50%" y="${Math.round(size * 0.77)}" text-anchor="middle"
              font-family="Arial, sans-serif" font-size="${Math.round(size * 0.09)}"
              font-weight="700" letter-spacing="${Math.round(size * 0.012)}" fill="#08796b">TIME</text>
          </svg>`,
        ),
        top: 0,
        left: 0,
      },
      {
        input: logo,
        left: Math.round((size - logoWidth) / 2),
        top: Math.round(size * 0.42 - logoHeight / 2),
      },
    ])
    .png()
    .toFile(path.join(outputDir, fileName));
}

await Promise.all([
  makeIcon(180, "apple-touch-icon.png"),
  makeIcon(192, "icon-192.png"),
  makeIcon(512, "icon-512.png"),
  makeIcon(512, "icon-maskable-512.png", { maskable: true }),
]);

console.log("Generated Party Perfect Time icons from public/party-perfect-logo.png");
