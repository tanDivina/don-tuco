#!/usr/bin/env node
// Records the LIVE landing page (don-tuco.vercel.app) as one clip per scene,
// timed to the narration: hero (CTA hover wakes the toucan), the wedge
// (stats, Meet Don Tuco, why), under the hood, measured numbers, the config
// pack, and the close. Writes WORK/site/<scene>.mp4.
// Usage: node record_site.cjs [workdir] [scene,scene...]
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const puppeteer = require('/Users/dorienvandenabbeele/Documents/antigravity/noble-pythagoras/node_modules/puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const SITE = process.env.SITE_URL || 'https://don-tuco.vercel.app/';
const WORK = process.argv[2] || path.join(process.env.HOME, 'Desktop', 'DonTuco_Video', 'promo_work');
const OUT = path.join(WORK, 'site');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[3] ? process.argv[3].split(',') : null;
const LEAD = 0.3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dur = (f) => {
  try { return parseFloat(execSync(`/opt/homebrew/bin/ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString()); }
  catch { return 3; }
};
const len = (line, pad = 1.0) => LEAD + dur(path.join(WORK, 'audio', `${line}.mp3`)) + pad;

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,940', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.2 });
  // The site only wakes the toucan for a hover-capable pointer; headless has none.
  await page.evaluateOnNewDocument(() => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/hover:\s*hover|pointer:\s*fine/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q));
  });

  // Each scene: fresh screencast into its own file, real time, with a heartbeat
  // pixel so idle stretches still produce frames (no clock drift).
  async function scene(name, seconds, run) {
    if (only && !only.includes(name)) return;
    const file = path.join(OUT, `${name}.mp4`);
    const ff = spawn(FFMPEG, ['-y', '-use_wallclock_as_timestamps', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-i', '-',
      '-vf', 'scale=1920:1080:flags=lanczos', '-fps_mode', 'cfr', '-r', '30', '-t', seconds.toFixed(2),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', file]);
    ff.stderr.on('data', () => {});
    ff.stdin.on('error', () => {});
    const closed = new Promise((r) => ff.on('close', r));
    const cdp = await page.target().createCDPSession();
    cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
      try { ff.stdin.write(Buffer.from(data, 'base64')); await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
    const t0 = Date.now();
    await run(() => (Date.now() - t0) / 1000);
    const left = seconds + 0.5 - (Date.now() - t0) / 1000;
    if (left > 0) await sleep(left * 1000);
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    ff.stdin.end();
    await closed;
    console.log(`✓ ${name}.mp4 (${seconds.toFixed(1)}s)`);
  }
  const at = async (now, t) => { const w = t - now(); if (w > 0) await sleep(w * 1000); };
  const scrollTo = (y, ms = 1400) => page.evaluate((target, d) => new Promise((done) => {
    const from = window.scrollY, delta = target - from, start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / d);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      window.scrollTo(0, from + delta * e);
      k < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), y, ms);
  const topOf = (sel, offset = 0) => page.evaluate((s, o) => {
    const el = document.querySelector(s); return el ? el.getBoundingClientRect().top + window.scrollY - o : 0;
  }, sel, offset);
  const hoverCta = async (on) => {
    const c = await page.evaluate(() => {
      const r = document.querySelector('.poster-cta').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(on ? c.x : 40, on ? c.y : 40, { steps: 18 });
  };
  const fresh = async () => {
    await page.goto(SITE, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = `#fps-hb{position:fixed;right:0;bottom:0;width:2px;height:2px;z-index:99999;animation:fpshb .033s infinite linear}
        @keyframes fpshb{0%{background:#f6efe2}50%{background:#f5eee1}100%{background:#f6efe2}}
        html{scroll-behavior:auto!important}`;
      document.head.appendChild(s);
      const d = document.createElement('div'); d.id = 'fps-hb'; document.body.appendChild(d);
    });
  };

  // ── hero: entrance, floating chat, then the CTA wakes the toucan ─────────
  await fresh();
  await page.goto('about:blank');
  await scene('hero', len('n_intro', 1.4), async (now) => {
    await fresh();
    await at(now, 4.2); await hoverCta(true);
  });

  // ── wedge: stats band, Meet Don Tuco (animated portrait), why ────────────
  await fresh();
  await scene('wedge', len('n_wedge', 1.2), async (now) => {
    await scrollTo(await topOf('.stats', 330), 1600);
    await at(now, 3.6); await scrollTo(await topOf('#meet', 40), 1600);
    await at(now, 8.4); await scrollTo(await topOf('#why', 120), 1600);
  });

  // ── under the hood: highlight each service as it's named ─────────────────
  await scene('arch', len('n_arch', 1.2), async (now) => {
    await scrollTo(await topOf('#aws', 60), 1500);
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = `#aws li{transition:transform .5s, box-shadow .5s, background .5s}
        #aws li.lit{transform:translateX(10px);box-shadow:0 0 0 2px #d58a2a, 0 12px 28px rgba(140,80,20,.18)}`;
      document.head.appendChild(s);
    });
    const lit = (i) => page.evaluate((k) => document.querySelectorAll('#aws li')[k]?.classList.add('lit'), i);
    // word timings: EUM Social ~4.5 s, Bedrock ~10.5 s, DynamoDB/Lambda/SNS ~16 s, SES ~21 s (+LEAD)
    await at(now, 5.0); await lit(0);
    await at(now, 11.0); await lit(1);
    await at(now, 16.5); await lit(3);
    await at(now, 21.5); await lit(2);
  });

  // ── measured numbers: the stats band, showing the CloudWatch numbers ─────
  await scene('numbers', len('n_numbers', 1.2), async (now) => {
    await page.evaluate(() => {
      const st = document.querySelectorAll('.stats .stat');
      st[0].querySelector('.n').textContent = '3.8 s';
      st[0].querySelector('.l').textContent = 'median reply, 14 live WhatsApp replies (CloudWatch)';
      st[1].querySelector('.n').textContent = '~2¢';
      st[1].querySelector('.l').textContent = 'per reply, all in: Bedrock plus WhatsApp delivery, at list prices';
      document.querySelector('.stats .note').textContent = 'Measured Oct 22 to 27, 2026 on the production agent (Claude on Amazon Bedrock).';
    });
    await scrollTo(await topOf('.stats', 330), 1400);
  });

  // ── the config pack: one file per operator ───────────────────────────────
  await scene('pack', len('n_pack', 1.2), async (now) => {
    await scrollTo(await topOf('#pack', 80), 1500);
  });

  // ── close: back to the poster, toucan awake ──────────────────────────────
  await scene('close', len('n_close', 2.4), async (now) => {
    await page.mouse.move(40, 40);
    await scrollTo(0, 1600);
    await at(now, 1.9); await hoverCta(true);
  });

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
