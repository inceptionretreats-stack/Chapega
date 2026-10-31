const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const directory = __dirname;
const fonts = path.resolve(directory, "../assets/fonts");
const width = 1024;
const height = 500;
const background = "#f8f3ec";
const wine = "#7a263a";
const linen = "#fff9f2";
const gold = "#c69b57";

// Typography is rendered from the bundled font files, not machine fonts.
const labels = [
  { text: "FOR CHAPEGA SHOP TEAMS", x: 80, y: 94, size: 13, weight: "Bold", color: wine },
  {
    text: "Chapega Studio",
    x: 76,
    y: 145,
    size: 59,
    weight: "SemiBold",
    family: "Playfair Display",
    color: wine,
  },
  { text: "Orders, stock", x: 80, y: 246, size: 34, weight: "SemiBold", color: "#352a2d" },
  { text: "and your team.", x: 80, y: 290, size: 34, weight: "SemiBold", color: "#352a2d" },
  { text: "Keep your shop moving.", x: 80, y: 375, size: 18, weight: "Regular", color: "#766a67" },
  { text: "Chapega.com", x: 754, y: 423, size: 17, weight: "Medium", color: linen },
];

const illustration = `
  <rect width="1024" height="500" fill="${background}"/>
  <rect x="614" width="410" height="500" fill="${wine}"/>
  <path d="M614 0v500" fill="none" stroke="${gold}" stroke-width="2"/>
  <path d="M80 67h40" stroke="${gold}" stroke-width="3"/>
  <path d="M80 352h432" stroke="#e2d6c8"/>
  <path d="M682 382h268" stroke="${gold}" opacity=".55"/>
  <ellipse cx="819" cy="365" rx="112" ry="8" fill="#5f182b"/>
  <path d="M817 177c-9-34-55-91-79-68-25 24 24 61 79 68Z" fill="none" stroke="${gold}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M817 177c9-34 55-91 79-68 25 24-24 61-79 68Z" fill="none" stroke="${gold}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="718" y="211" width="198" height="144" rx="3" fill="${linen}"/>
  <path d="M718 225h198" stroke="#e9ddd1" stroke-width="2"/>
  <rect x="702" y="177" width="230" height="46" rx="4" fill="#f4e5d3"/>
  <path d="M805 177h25v178h-25Z" fill="${gold}"/>
  <path d="M702 190h230" stroke="${linen}" opacity=".65"/>
  <path d="M763 254v72" stroke="#ddc9b0" stroke-width="2"/>
  <path d="M871 254v72" stroke="#ddc9b0" stroke-width="2"/>
  <g transform="translate(704 416) scale(.072)">
    <path d="M340 176A128 128 0 1 0 340 336" fill="none" stroke="${linen}" stroke-width="46" stroke-linecap="round"/>
    <circle cx="364" cy="352" r="26" fill="${gold}"/>
  </g>`;

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function familyFor(label) {
  return label.family ?? "DM Sans";
}

function fontFileFor(label) {
  const prefix = label.family === "Playfair Display" ? "PlayfairDisplay" : "DMSans";
  return path.join(fonts, `${prefix}-${label.weight}.ttf`);
}

async function main() {
  const layers = [];
  for (const label of labels) {
    const layer = await sharp({
      text: {
        text: `<span foreground="${label.color}">${escapeXml(label.text)}</span>`,
        font: `${familyFor(label)} ${label.weight} ${label.size}`,
        fontfile: fontFileFor(label),
        dpi: 72,
        rgba: true,
      },
    })
      .png()
      .toBuffer({ resolveWithObject: true });
    if (label.x + layer.info.width > width - 68 || label.y + layer.info.height > height - 36) {
      throw new Error(`Text exceeds graphic safe area: ${label.text}`);
    }
    layers.push({ input: layer.data, left: label.x, top: label.y });
  }

  const svgStart = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">Chapega Studio</title><desc id="description">Orders, stock and shop teams, with an illustrated gift box.</desc>`;
  const editableText = labels
    .map(
      (label) =>
        `<text x="${label.x}" y="${label.y + label.size * 0.82}" font-family="${familyFor(label)}" font-size="${label.size}" font-weight="${label.weight === "Regular" ? 400 : label.weight === "Medium" ? 500 : label.weight === "SemiBold" ? 600 : 700}" fill="${label.color}">${escapeXml(label.text)}</text>`,
    )
    .join("\n");
  await fs.writeFile(
    path.join(directory, "feature-graphic-1024x500.svg"),
    `${svgStart}${illustration}\n${editableText}\n</svg>\n`,
  );

  const output = path.join(directory, "feature-graphic-1024x500.png");
  await sharp(Buffer.from(`${svgStart}${illustration}</svg>`))
    .composite(layers)
    .flatten({ background })
    .removeAlpha()
    .png()
    .toFile(output);
  const graphic = await sharp(output).metadata();
  const encoded = await fs.readFile(output);
  if (
    graphic.width !== width ||
    graphic.height !== height ||
    graphic.hasAlpha ||
    encoded[25] !== 2
  ) {
    throw new Error("Feature graphic must be 1024x500 RGB PNG without alpha");
  }

  const fields = [
    ["title", 30],
    ["short-description", 80],
    ["full-description", 4000],
    ["release-notes", 500],
  ];
  const counts = {};
  for (const [name, limit] of fields) {
    const content = (
      await fs.readFile(path.join(directory, "listing/en-IN", `${name}.txt`), "utf8")
    ).trim();
    const count = [...content].length;
    if (!content || count > limit) throw new Error(`${name} exceeds its ${limit}-character limit`);
    counts[name] = { count, limit };
  }
  const metadata = JSON.parse(await fs.readFile(path.join(directory, "metadata.json"), "utf8"));
  if ([...metadata.featureGraphicAltText].length > 140)
    throw new Error("Feature graphic alt text is too long");
  process.stdout.write(
    `${JSON.stringify({ graphic: { width, height, channels: graphic.channels, hasAlpha: graphic.hasAlpha, bytes: encoded.length }, counts }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
