#!/usr/bin/env node
// Composes the Don Tuco demo video (1920x1080) from:
//   site/<scene>.mp4 (record_site.cjs) + narration in audio/ (garden clone voice)
//   personal clips in ../personal/: p1_open, p2_story, p3_signoff (.mov/.mp4), Dorien on camera
//   phone demo: ../personal/whatsapp_demo.(mkv|mp4|mov), the real chat via scrcpy
// Missing clips become slates that show the script, so the timing is reserved.
// Music: tropical.mp3 (Finca Montezuma brand track), looped, ducked under voices.
// Usage: node compose.cjs [workdir] [out.mp4]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
const MAGICK = '/opt/homebrew/bin/magick';
const WORK = process.argv[2] || path.join(process.env.HOME, 'Desktop', 'DonTuco_Video', 'promo_work');
const PERSONAL = path.join(path.dirname(WORK), 'personal');
const OUT = process.argv[3] || path.join(path.dirname(WORK), 'don_tuco_demo.mp4');
const MUSIC = process.env.MUSIC || path.join(process.env.HOME, 'finca-montezuma-promo', 'public', 'audio', 'tropical.mp3');
const SEG = path.join(WORK, 'seg');
fs.mkdirSync(SEG, { recursive: true });
const LEAD = 0.3;
const PAPER = '#f6efe2', INK = '#2a1a0e', ORANGE = '#e0752a';
const SERIF = '/System/Library/Fonts/Supplemental/Georgia.ttf';
const SERIF_I = '/System/Library/Fonts/Supplemental/Georgia Italic.ttf';
const MUSIC_DB = -19;          // bed level under narration before ducking

const A = (n) => path.join(WORK, 'audio', `${n}.mp3`);
const dur = (f) => parseFloat(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const hasAudio = (f) => execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', f]).toString().trim() !== '';
const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const V_OUT = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30'];
const A_OUT = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const find = (base) => ['.mov', '.mp4', '.mkv', '.MOV', '.MP4'].map((e) => path.join(PERSONAL, base + e)).find(fs.existsSync);

function mix(cues, firstInput, len) {
  if (!cues.length) return `anullsrc=r=48000:cl=stereo,atrim=0:${len.toFixed(3)}[aout]`;
  const parts = cues.map((c, i) => {
    const ms = Math.max(0, Math.round(c.t * 1000));
    return `[${firstInput + i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${c.vol ?? 1},adelay=${ms}|${ms}[a${i}]`;
  });
  return [...parts, `${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,apad,atrim=0:${len.toFixed(3)}[aout]`].join(';');
}

let n = 0;
const segs = [];
const next = () => path.join(SEG, `${String(++n).padStart(2, '0')}.mp4`);

// A recorded site scene with narration cues [{line, t}].
function site(scene, cues) {
  const v = path.join(WORK, 'site', `${scene}.mp4`);
  const len = dur(v); const out = next();
  const cs = cues.map((c) => ({ ...c, file: A(c.line) }));
  ff(['-i', v, ...cs.flatMap((c) => ['-i', c.file]), '-filter_complex', mix(cs, 1, len),
    '-map', '0:v', '-map', '[aout]', ...V_OUT, ...A_OUT, '-t', len.toFixed(3), out]);
  segs.push(out); console.log(`✓ ${path.basename(out)} site/${scene} ${len.toFixed(1)}s`);
}

// A slate holding a personal clip's place, showing what to say.
function slate(label, script, seconds, cues = []) {
  const png = path.join(WORK, `slate_${n + 1}.png`);
  execFileSync(MAGICK, ['-size', '1920x1080', `xc:${PAPER}`,
    '-font', SERIF, '-fill', ORANGE, '-pointsize', '34', '-gravity', 'north', '-annotate', '+0+170', label.toUpperCase(),
    '(', '-size', '1400x', '-background', 'none', '-font', SERIF_I, '-fill', INK, '-pointsize', '50', '-gravity', 'center', `caption:${script}`, ')',
    '-gravity', 'center', '-geometry', '+0+40', '-composite', png]);
  const out = next();
  const cs = cues.map((c) => ({ ...c, file: A(c.line) }));
  ff(['-loop', '1', '-t', String(seconds), '-i', png, ...cs.flatMap((c) => ['-i', c.file]),
    '-filter_complex', `[0:v]scale=1920:1080,format=yuv420p[v];` + mix(cs, 1, seconds),
    '-map', '[v]', '-map', '[aout]', ...V_OUT, ...A_OUT, '-t', String(seconds), out]);
  segs.push(out); console.log(`… ${path.basename(out)} SLATE ${label} ${seconds}s`);
}

// Dorien on camera: centred, the side strips filled with a blurred copy of the clip,
// plus an optional transparent overlay (record_intro.cjs) on top. Own sound kept.
function personal(base, label, script, seconds, overlay) {
  const f = find(base);
  if (!f) return slate(label, script, seconds);
  const len = dur(f); const out = next();
  const ov = overlay && fs.existsSync(path.join(WORK, overlay)) ? path.join(WORK, overlay) : null;
  const v = `[0:v]split[bg0][fg0];[bg0]scale=1920:-2,crop=1920:1080:0:(ih-1080)*0.55,boxblur=28:2,eq=brightness=-0.07:saturation=0.85[bg];` +
    `[fg0]scale=-2:1080:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:0` + (ov ? `[base];[base][1:v]overlay=0:0:eof_action=pass` : '') + `,setsar=1,format=yuv420p[v]`;
  const a = hasAudio(f) ? `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5[aout]` : `anullsrc=r=48000:cl=stereo,atrim=0:${len}[aout]`;
  ff(['-i', f, ...(ov ? ['-i', ov] : []), '-filter_complex', `${v};${a}`, '-map', '[v]', '-map', '[aout]', ...V_OUT, ...A_OUT, '-t', len.toFixed(3), out]);
  segs.push(out); console.log(`✓ ${path.basename(out)} personal ${path.basename(f)} ${len.toFixed(1)}s${ov ? ' + overlay' : ''}`);
}

// A pre-rendered clip with its own sound (the cold open), normalised to the segment format.
function own(rel) {
  const f = path.join(WORK, rel);
  if (!fs.existsSync(f)) return;
  const len = dur(f); const out = next();
  ff(['-i', f, '-filter_complex', `[0:v]scale=1920:1080,setsar=1,format=yuv420p[v];[0:a]aformat=sample_rates=48000:channel_layouts=stereo[aout]`,
    '-map', '[v]', '-map', '[aout]', ...V_OUT, ...A_OUT, '-t', len.toFixed(3), out]);
  segs.push(out); console.log(`✓ ${path.basename(out)} ${rel} ${len.toFixed(1)}s`);
}

// The real WhatsApp chat: phone screen beside the site's poster colors, narration over it.
// A small paper card for the side panels, rendered by headless Chrome with a
// transparent background (this ffmpeg has no drawtext; ImageMagick stacks badly).
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
function card(file, lines, width = 500) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = lines.map(([text, size, color, font]) =>
    `<div style="font:${size}px/1.25 ${font === 'mono' ? 'Menlo, monospace' : font === 'italic' ? 'italic Georgia, serif' : 'Georgia, serif'};color:${color};margin:0 0 ${Math.round(size * 0.35)}px">${esc(text)}</div>`).join('');
  const html = file.replace(/\.png$/, '.html');
  fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">
<div id="c" style="display:inline-block;box-sizing:border-box;width:${width}px;background:#fffaf0;border:2px solid #e7d6b8;border-radius:18px;padding:24px 28px 14px;box-shadow:0 10px 26px rgba(80,50,20,.12)">${body}</div></body></html>`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--window-size=${width + 30},420`, `--screenshot=${file}`, 'file://' + html], { stdio: 'ignore' });
  execFileSync(MAGICK, [file, '-trim', '+repage', file]);
  return file;
}

// The real WhatsApp chat (scrcpy take): typing tails at 1x, each wait sped up to
// ~2.5 s with the true on-phone reply time stamped, each reply held to read.
// Side panels name the tool Don Tuco really called that turn.
function phone(base, cues, seconds) {
  const f = find(base);
  const editFile = path.join(PERSONAL, 'whatsapp_edit.json');
  if (!f || !fs.existsSync(editFile)) return slate('Your clip: real WhatsApp demo (scrcpy)', 'The live conversation with Don Tuco on your phone. See the chat script.', seconds, cues);
  const ed = JSON.parse(fs.readFileSync(editFile, 'utf8'));
  const WAIT_SHOWN = 2.5, TYPE_TAIL = 2.2, READ_TRIM = 1.0;
  const pieces = []; const stamps = []; let t = 0;
  ed.exchanges.forEach((x, i) => {
    const a = i === 0 ? x.sent - ed.lead : x.sent - TYPE_TAIL;
    pieces.push({ a, b: x.sent, k: 1 }); t += x.sent - a;
    const real = x.reply - x.sent, k = Math.max(1, real / WAIT_SHOWN);
    const waitStart = t;
    pieces.push({ a: x.sent, b: x.reply, k }); t += real / k;
    const read = Math.max(3, x.read - READ_TRIM); // keeps the cut under 3:00
    pieces.push({ a: x.reply, b: x.reply + read, k: 1 }); t += read;
    stamps.push({ i, from: waitStart, to: t, x, real });
  });
  const len = t;
  // Narration anchored to exchanges: intro at the top, booking line from turn 2, more from turn 4.
  const at = { start: 0.5, ex1: stamps[1].from, ex3: stamps[3].from };
  const cs = cues.map((c) => ({ ...c, t: typeof c.t === 'string' ? at[c.t] : c.t, file: A(c.line) }));

  const pngs = [];
  pngs.push(card(path.join(WORK, 'wa_badge.png'), [
    ['LIVE AGENT · REAL PHONE', 20, ORANGE], ['Recorded Oct 27, 2026', 34, INK],
    ['WhatsApp through AWS End User Messaging Social. Nothing staged, nothing edited inside the chat.', 23, '#6b5a48', 'italic']]));
  stamps.forEach((st) => {
    st.png = card(path.join(WORK, `wa_stamp_${st.i}.png`), [
      [`replied in ${st.real.toFixed(1)} s`, 44, INK],
      [st.x.tool, 28, ORANGE, 'mono'],
      [st.x.detail, 26, '#4b3a2a'],
      [st.real > WAIT_SHOWN + 0.2 ? 'real reply time on the phone; the wait is shown faster' : 'real reply time on the phone', 18, '#8d7b66', 'italic']]);
    pngs.push(st.png);
  });

  const C = ed.crop;
  let fc = `[0:v]fps=30,crop=${C.w}:${C.h}:${C.x}:${C.y},scale=-2:1000:flags=lanczos,setsar=1,split=${pieces.length}${pieces.map((_, i) => `[p${i}]`).join('')};`;
  fc += pieces.map((p, i) => `[p${i}]trim=${p.a.toFixed(3)}:${p.b.toFixed(3)},setpts=(PTS-STARTPTS)/${p.k.toFixed(4)}[q${i}]`).join(';');
  fc += ';' + pieces.map((_, i) => `[q${i}]`).join('') + `concat=n=${pieces.length}:v=1:a=0,fps=30[ph];`;
  fc += `color=c=${PAPER}:s=1920x1080:r=30:d=${len.toFixed(3)}[bg];[bg][ph]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1[v0]`;
  const imgBase = 1 + cs.length;
  fc += `;[v0][${imgBase}:v]overlay=x=80:y=(H-h)/2[v1]`;
  let last = 'v1';
  stamps.forEach((st, k) => {
    const idx = imgBase + 1 + k;
    fc += `;[${last}][${idx}:v]overlay=x=W-w-80:y=(H-h)/2:enable='between(t,${st.from.toFixed(2)},${st.to.toFixed(2)})'[s${k}]`;
    last = `s${k}`;
  });
  fc += ';' + mix(cs, 1, len);
  const out = next();
  ff(['-i', f, ...cs.flatMap((c) => ['-i', c.file]), ...pngs.flatMap((p) => ['-i', p]),
    '-filter_complex', fc, '-map', `[${last}]`, '-map', '[aout]', ...V_OUT, ...A_OUT, '-t', len.toFixed(3), out]);
  segs.push(out); console.log(`✓ ${path.basename(out)} phone ${path.basename(f)} ${len.toFixed(1)}s (from ${dur(f).toFixed(0)}s raw)`);
}

fs.readdirSync(SEG).forEach((f) => fs.unlinkSync(path.join(SEG, f)));

// Cold open: a real Don Tuco reply landing (record_intro.cjs), then Dorien with the overlay.
own('intro/cold.mp4');
personal('p1_open', 'Your clip P1: cold open, about 12 s',
  "Hi, I'm Dorien. I run tours at Finca Montezuma, a cacao farm in Bocas del Toro. My guests book on WhatsApp, in three languages: late at night, or while I'm out on the boat with a group. I miss messages, and I miss bookings.", 13, 'intro/overlay.mov');
site('hero', [{ line: 'n_intro', t: LEAD }]);
site('wedge', [{ line: 'n_wedge', t: LEAD }]);
phone('whatsapp_demo', [{ line: 'n_demo', t: 'start' }, { line: 'n_demo_book', t: 'ex1' }, { line: 'n_demo_more', t: 'ex3' }], 60);
site('arch', [{ line: 'n_arch', t: LEAD }]);
site('numbers', [{ line: 'n_numbers', t: LEAD }]);
site('pack', [{ line: 'n_pack', t: LEAD }]);
personal('p2_story', 'Your clip P2: the business story, about 18 s',
  "Don Tuco runs at our own farm first, and he's taking real bookings. I also build websites for tour operators across Bocas and the Caribbean, like my partner Papito's boat tours. They all live on WhatsApp too, and each one is a single config file away from their own Don Tuco.", 18);
site('close', [{ line: 'n_close', t: LEAD }]);
if (find('p3_signoff')) if (find('p3_signoff')) personal('p3_signoff', 'Your clip P3 (optional): sign-off, about 5 s',
  'Write to Don Tuco yourself, the number is on screen. ¡Nos vemos en la finca!', 5);

// Concatenate the picture + voice track.
const list = path.join(SEG, 'list.txt');
fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
const joined = path.join(WORK, 'joined.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
const T = dur(joined);

// Music bed: loop with a crossfade, duck under every voice, fade out at the end.
const md = dur(MUSIC);
const loops = Math.ceil(T / (md - 3)) + 1;
let mfc = '';
for (let i = 0; i < loops; i++) mfc += `[${1 + i}:a]aformat=sample_rates=48000:channel_layouts=stereo[m${i}];`;
let last = 'm0';
for (let i = 1; i < loops; i++) { mfc += `[${last}][m${i}]acrossfade=d=3[mx${i}];`; last = `mx${i}`; }
mfc += `[${last}]atrim=0:${T.toFixed(3)},volume=${MUSIC_DB}dB,afade=t=in:d=1.5,afade=t=out:st=${(T - 3).toFixed(3)}:d=3[bed];`;
mfc += `[0:a]asplit=2[voice][key];[bed][key]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=600[ducked];`;
mfc += `[voice][ducked]amix=inputs=2:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=11[aout]`;
ff(['-i', joined, ...Array.from({ length: loops }, () => ['-i', MUSIC]).flat(), '-filter_complex', mfc,
  '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', ...A_OUT, '-movflags', '+faststart', OUT]);
console.log(`\n✅ ${OUT} (${dur(OUT).toFixed(1)}s, ${segs.length} segments)`);
