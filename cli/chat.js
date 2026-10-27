#!/usr/bin/env node
// Local test REPL: talk to Don Tuco in the terminal, no WhatsApp/WABA needed.
// Uses the real Bedrock agent + in-memory bookings; WhatsApp/SES side effects print.
// Usage: AWS_PROFILE=... node cli/chat.js [pack-name]
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { runAgent } from "../src/agent.js";

const packName = process.argv[2] || "finca-montezuma";
const pack = JSON.parse(readFileSync(new URL(`../packs/${packName}.json`, import.meta.url)));

const ctx = {
  waId: "local-test",
  sendLocation: async (loc) => console.log(`\n📍 [location pin sent: ${loc.description} (${loc.latitude}, ${loc.longitude})]`),
  confirmEmail: async (b) => console.log(`\n✉️  [SES confirmation would send: ${b.guestName}, ${b.date} ${b.time}, ${b.people}p]`),
  notifyOwner: async (t) => console.log(`\n🔔 [owner notified: ${t}]`),
};

const rl = createInterface({ input: process.stdin, output: process.stdout });
let messages = [];
console.log(`Don Tuco local chat — pack: ${pack.businessName}. Ctrl+C to quit.\n`);

for (;;) {
  const line = (await rl.question("guest> ")).trim();
  if (!line) continue;
  const prefix = messages.length
    ? ""
    : `[Conversation start. Now: ${new Date().toLocaleString("en-US", { timeZone: pack.timezone })} (${pack.timezone}). Guest WhatsApp name: Local Tester]\n`;
  messages.push({ role: "user", content: prefix + line });
  const t0 = Date.now();
  const res = await runAgent(pack, messages, ctx);
  messages = res.messages;
  console.log(`\nDon Tuco (${((Date.now() - t0) / 1000).toFixed(1)}s): ${res.reply}\n`);
}
