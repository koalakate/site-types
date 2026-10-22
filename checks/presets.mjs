// Contrast check for the theme presets in presets.css: text on the background and surface, muted text,
// text on an accent fill (4.5:1), and the accent itself as large text such as eyebrows (3:1).
import { readFile } from "node:fs/promises";

const PAIRS = [
  ["foreground", "background", 4.5],
  ["foreground", "surface", 4.5],
  ["muted", "background", 4.5],
  ["on-accent", "accent", 4.5],
  ["accent", "background", 3],
];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export async function checkPresets(file) {
  const css = await readFile(file, "utf8");
  const problems = [];
  const presets = [...css.matchAll(/:root\[data-preset="([a-z0-9-]+)"\]\s*\{([^}]*)\}/g)];
  if (!presets.length) problems.push(`${file}: no presets found`);
  for (const [, name, body] of presets) {
    const tokens = Object.fromEntries([...body.matchAll(/--([ld])-([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(([, s, t, v]) => [`${s}-${t}`, v]));
    for (const scheme of ["l", "d"]) {
      for (const [fg, bg, min] of PAIRS) {
        const a = tokens[`${scheme}-${fg}`];
        const b = tokens[`${scheme}-${bg}`];
        if (!a || !b) { problems.push(`preset ${name}: --${scheme}-${fg} and --${scheme}-${bg} must be #rrggbb colors`); continue; }
        const ratio = contrast(a, b);
        if (ratio < min) problems.push(`preset ${name} ${scheme === "l" ? "light" : "dark"}: ${fg} ${a} on ${bg} ${b} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
      }
    }
  }
  return problems;
}

// presets.json (the picker list: key, name, note, scheme) must list exactly the presets of presets.css, in order.
export async function checkPresetList(jsonFile, cssFile) {
  const problems = [];
  let list;
  try {
    list = JSON.parse(await readFile(jsonFile, "utf8"));
  } catch (error) {
    return [`${jsonFile}: ${error.message}`];
  }
  const css = await readFile(cssFile, "utf8");
  const keys = [...css.matchAll(/:root\[data-preset="([a-z0-9-]+)"\]\s*\{/g)].map((match) => match[1]);
  if (!Array.isArray(list)) return [`${jsonFile}: must be an array`];
  const listed = list.map((item) => item?.key);
  if (JSON.stringify(listed) !== JSON.stringify(keys)) problems.push(`presets.json keys [${listed.join(", ")}] differ from presets.css presets [${keys.join(", ")}]`);
  for (const item of list) {
    for (const field of ["key", "name", "note"]) if (typeof item?.[field] !== "string" || !item[field].trim()) problems.push(`presets.json ${item?.key}: ${field} must be a non-empty string`);
    if (item?.scheme !== "light" && item?.scheme !== "dark") problems.push(`presets.json ${item?.key}: scheme must be "light" or "dark"`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL("../slides/", import.meta.url).pathname;
  const problems = [...(await checkPresets(`${dir}presets.css`)), ...(await checkPresetList(`${dir}presets.json`, `${dir}presets.css`))];
  for (const line of problems) console.log(line);
  process.exit(problems.length ? 1 : 0);
}
