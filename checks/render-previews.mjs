// Renders slides/previews/<key>.png (960x540): a fixed sample cover in each preset, with the scheme from
// presets.json. Run once per release after a change to presets.css, then commit the PNGs.
//   node checks/render-previews.mjs
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveSite } from "./serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIR = path.join(ROOT, "slides");
const OUT_DIR = path.join(PACKAGE_DIR, "previews");
const COVER = `<section data-layout="title">
  <p class="eyebrow">Quarterly review</p>
  <h1>Revenue grew in every region</h1>
  <p class="lead">Three bets for the next quarter</p>
  <p class="meta">October 2026</p>
</section>
`;

const presets = JSON.parse(await readFile(path.join(PACKAGE_DIR, "presets.json"), "utf8"));
await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  for (const preset of presets) {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "slides-preview-"));
    try {
      await mkdir(path.join(dataDir, "project", "slides"), { recursive: true });
      await writeFile(path.join(dataDir, "project", "slides", "cover.html"), COVER);
      await writeFile(path.join(dataDir, "project", "deck.json"), JSON.stringify({
        v: 1, title: `${preset.name} preview`, lang: "en", order: ["cover"], theme: { preset: preset.key, scheme: preset.scheme },
      }));
      const site = await serveSite({ packageDir: PACKAGE_DIR, dataDir });
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.5 });
      try {
        const page = await context.newPage();
        await page.goto(`${site.url}/#cover`);
        await page.waitForFunction(() => !document.getElementById("app").hasAttribute("aria-busy"));
        await page.locator(".stage .slide-host").waitFor();
        await page.addStyleTag({ content: ".toolbar, .progress { display: none !important; }" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(800);
        await page.locator(".stage .slide-host").screenshot({ path: path.join(OUT_DIR, `${preset.key}.png`), animations: "disabled", caret: "hide" });
        console.log(`previews/${preset.key}.png`);
      } finally {
        await context.close();
        await site.close();
      }
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}
