/*
 * Renders the video ads to MP4 (H.264, 30 fps, with a silent audio track so
 * Instagram and Facebook accept them; add music in the app when posting).
 *
 *   node marketing/ads/src/render.mjs                 # every ad, language and format
 *   node marketing/ads/src/render.mjs schools fr 9x16 # just one
 *
 * Needs Playwright's Chromium and ffmpeg (the imageio-ffmpeg binary is used
 * when ffmpeg isn't on the PATH; or set FFMPEG=/path/to/ffmpeg).
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

import { ADS, TIMING } from "./ads.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..");
const FPS = 30;
const FORMATS = ["9x16", "4x5"];

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    return execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"], { encoding: "utf8" }).trim();
  }
}

const [onlyAd, onlyLang, onlyFormat] = process.argv.slice(2);
const jobs = [];
for (const ad of Object.keys(ADS)) for (const lang of ["en", "fr"]) for (const format of FORMATS) {
  if ((onlyAd && onlyAd !== ad) || (onlyLang && onlyLang !== lang) || (onlyFormat && onlyFormat !== format)) continue;
  jobs.push({ ad, lang, format });
}

const ffmpeg = ffmpegPath();
const browser = await chromium.launch();
try {
  for (const { ad, lang, format } of jobs) {
    const page = await browser.newPage({ viewport: { width: 1080, height: format === "9x16" ? 1920 : 1350 } });
    await page.goto(pathToFileURL(join(here, "template.html")).href);
    const info = await page.evaluate(([a, f, t]) => window.setup(a, f, t), [ADS[ad][lang], format, TIMING]);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));

    const dir = join(OUT, ad);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `wazabolt-${ad}-${lang}-${format}.mp4`);
    const enc = spawn(ffmpeg, [
      "-loglevel", "error", "-y",
      "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", file,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((res, rej) => enc.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

    const frames = Math.ceil((info.duration / 1000) * FPS);
    for (let f = 0; f < frames; f++) {
      const ms = (f / FPS) * 1000;
      await page.evaluate((m) => window.render(m), ms);
      const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
      if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once("drain", r));
      // Cover image: the hook, fully shown.
      if (Math.abs(ms - (TIMING.hook - 300)) < 1000 / FPS / 2) writeFileSync(join(dir, `cover-${ad}-${lang}-${format}.jpg`), jpg);
    }
    enc.stdin.end();
    await done;
    await page.close();
    console.log(`${file} (${frames} frames, ${(info.duration / 1000).toFixed(1)} s)`);
  }
} finally {
  await browser.close();
}
