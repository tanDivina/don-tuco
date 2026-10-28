#!/usr/bin/env node
// Renders intro.html frame by frame (same approach as the Lucienne video):
//   WORK/intro/cold.mp4     night cold open (3.6 s) with a soft chime as Don Tuco's reply lands
//   WORK/intro/overlay.mov  transparent layer (PNG in MOV) for the P1 clip, same length as the clip
// Usage: node record_intro.cjs [workdir] [cold,overlay]
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const puppeteer = require('/Users/dorienvandenabbeele/Documents/antigravity/noble-pythagoras/node_modules/puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const WORK = process.argv[2] || path.join(process.env.HOME, 'Desktop', 'DonTuco_Video', 'promo_work');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const ASSETS = path.join(__dirname, '..', '..', 'site', 'assets');
const P1 = ['.mp4', '.mov', '.MOV'].map((e) => path.join(WORK, '..', 'personal', 'p1_open' + e)).find(fs.existsSync);
const dur = (f) => parseFloat(execSync(`/opt/homebrew/bin/ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString());
const COLD = 3.6, CHIME_AT = 1.0;

const run = (args) => new Promise((res, rej) => {
  const p = spawn(FFMPEG, args); p.stderr.on('data', () => {});
  p.on('close', (c) => (c ? rej(new Error(`ffmpeg ${c}`)) : res()));
});

async function render(browser, scene, seconds, out, alpha) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'intro.html') + `?scene=${scene}&assets=${encodeURIComponent(ASSETS)}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__ready === true);
  const enc = alpha ? ['-c:v', 'png', '-pix_fmt', 'rgba'] : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p'];
  const ff = spawn(FFMPEG, ['-y', '-framerate', '30', '-f', 'image2pipe', '-vcodec', alpha ? 'png' : 'mjpeg', '-i', '-', ...enc, out]);
  ff.stderr.on('data', () => {});
  const closed = new Promise((r) => ff.on('close', r));
  const total = Math.round(seconds * 30);
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.seek(t), i / 30);
    const buf = alpha ? await page.screenshot({ type: 'png', omitBackground: true }) : await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await closed;
  await page.close();
  console.log(`✓ ${path.basename(out)} (${seconds.toFixed(2)}s, ${total} frames)`);
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1', '--allow-file-access-from-files'] });
  const dir = path.join(WORK, 'intro');
  fs.mkdirSync(dir, { recursive: true });
  if (!only || only.includes('cold')) {
    const silent = path.join(dir, 'cold_v.mp4');
    await render(browser, 'cold', COLD, silent, false);
    // Two soft bell partials, decaying, as the reply lands.
    const bell = (f, d) => `sine=f=${f}:d=${d}:r=48000,afade=t=out:st=0:d=${d}:curve=exp`;
    await run(['-y', '-i', silent, '-filter_complex',
      `${bell(1318, 1.2)},volume=0.22[a1];${bell(1976, 0.9)},volume=0.12[a2];[a1][a2]amix=inputs=2:normalize=0,adelay=${CHIME_AT * 1000}|${CHIME_AT * 1000},aformat=channel_layouts=stereo,apad,atrim=0:${COLD}[a]`,
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', path.join(dir, 'cold.mp4')]);
    console.log('✓ cold.mp4 with chime');
  }
  if ((!only || only.includes('overlay')) && P1) await render(browser, 'overlay', dur(P1), path.join(dir, 'overlay.mov'), true);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
