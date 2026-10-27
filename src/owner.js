// Owner relay: escalations reach the owner on WhatsApp, and the owner answers
// guests through the Don Tuco number. Meta only allows free-form messages to the
// owner inside the 24h window that opens when the owner last wrote to us; outside
// it we send an approved utility template, and the owner's reply reopens the window.
import { sendText, sendTemplate } from "./whatsapp.js";

const WINDOW_MS = 23.5 * 3600 * 1000; // a little under Meta's 24h, to be safe
const HANDOFF_MS = 12 * 3600 * 1000; // bot stays quiet this long after the owner's last relay

export const ownerKey = (waId) => `owner#${waId}`;

export function isOwner(pack, waId) {
  return Boolean(pack.owner?.whatsapp) && waId === pack.owner.whatsapp;
}

// Template parameters may not contain newlines, tabs, or long runs of spaces.
const param = (s, max = 300) => String(s).replace(/\s+/g, " ").trim().slice(0, max) || "-";

/**
 * Alert the owner on WhatsApp (howTo: add the reply instructions). Returns "whatsapp" or "template" for the channel used.
 * @param {object} ownerState stored owner item ({ lastInboundAt })
 */
export async function alertOwner(pack, ownerState, guestLabel, text, { howTo = true } = {}) {
  const to = pack.owner.whatsapp;
  if (ownerState?.lastInboundAt && Date.now() - ownerState.lastInboundAt < WINDOW_MS) {
    const footer = howTo ? "\n\nReply here and Don Tuco passes it on. Send #bot to hand the guest back." : "";
    await sendText(to, `${guestLabel}: ${text}${footer}`);
    return "whatsapp";
  }
  const t = pack.owner.template;
  await sendTemplate(to, t.name, t.language, [param(guestLabel, 100), param(text)]);
  return "template";
}

export function handoffActive(guestItem) {
  return Boolean(guestItem?.handoffUntil) && guestItem.handoffUntil > Date.now();
}

export const nextHandoffUntil = () => Date.now() + HANDOFF_MS;

/**
 * Parse an owner message. "#bot" hands the active guest back, "#+50760000000 text"
 * picks a guest explicitly, anything else goes to the active guest.
 */
export function parseOwnerMessage(text) {
  const t = text.trim();
  if (/^#bot\b/i.test(t)) return { command: "bot" };
  const m = t.match(/^#(\+\d{7,15})\s*([\s\S]*)$/);
  if (m) return { guest: m[1], text: m[2].trim() };
  return { text: t };
}
