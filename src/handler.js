// Lambda entrypoint: SNS (EUM Social inbound WhatsApp) → Don Tuco → reply.
// Conversation state lives in DynamoDB keyed by WhatsApp user id, TTL 24h —
// matching Meta's customer-service window.
import { readFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { runAgent } from "./agent.js";
import { parseInbound, sendText, sendLocation } from "./whatsapp.js";
import { confirmBooking, notifyOwner } from "./ses.js";
import { isOwner, ownerKey, alertOwner, handoffActive, nextHandoffUntil, parseOwnerMessage } from "./owner.js";

const pack = JSON.parse(
  readFileSync(new URL(`../packs/${process.env.OPERATOR_PACK || "finca-montezuma"}.json`, import.meta.url))
);
// The owner's personal number stays out of the public repo: set it on the Lambda.
if (process.env.OWNER_WHATSAPP) pack.owner = { ...pack.owner, whatsapp: process.env.OWNER_WHATSAPP };
const CONVO_TABLE = process.env.CONVERSATIONS_TABLE;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function loadItem(waId) {
  const res = await ddb.send(new GetCommand({ TableName: CONVO_TABLE, Key: { waId } }));
  return res.Item || null;
}

async function loadConversation(waId) {
  const item = await loadItem(waId);
  return { item, messages: item ? JSON.parse(item.messages) : [] };
}

// Puts the whole item, so carry over any fields (handoffUntil) from the loaded item.
async function saveConversation(waId, messages, extra = {}) {
  await ddb.send(
    new PutCommand({
      TableName: CONVO_TABLE,
      Item: {
        waId,
        ...extra,
        messages: JSON.stringify(messages),
        ttl: Math.floor(Date.now() / 1000) + 24 * 3600,
      },
    })
  );
}

async function saveOwnerState(state) {
  await ddb.send(
    new PutCommand({
      TableName: CONVO_TABLE,
      Item: { ...state, waId: ownerKey(pack.owner.whatsapp), ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 },
    })
  );
}

const guestLabel = (name, waId) => (name ? `${name} (${waId})` : waId);

/** The owner wrote to the Don Tuco number: relay to the guest or hand the guest back. */
async function handleOwner(msg) {
  const state = (await loadItem(ownerKey(msg.waId))) || {};
  state.lastInboundAt = Date.now();
  const parsed = parseOwnerMessage(msg.text);
  const guest = parsed.guest || state.activeGuest;

  if (!guest) {
    await saveOwnerState(state);
    await sendText(msg.waId, "No guest is waiting for you right now. To write to a guest, start with #+number, e.g. #+50760000000 Hola!");
    return;
  }
  state.activeGuest = guest;
  await saveOwnerState(state);

  const { item, messages } = await loadConversation(guest);
  if (parsed.command === "bot") {
    await saveConversation(guest, messages, { handoffUntil: 0 });
    await sendText(msg.waId, `Don Tuco is answering ${guest} again.`);
    return;
  }
  if (!parsed.text) return;

  await sendText(guest, `${pack.owner.name}, ${pack.businessName}: ${parsed.text}`);
  // Keep the owner's words in the guest's history so Don Tuco knows what was agreed.
  const prev = messages[messages.length - 1];
  const ownerNote = `[${pack.owner.name}, the owner, wrote to the guest:] ${parsed.text}`;
  if (prev?.role === "assistant" && typeof prev.content === "string" && prev.content.startsWith(`[${pack.owner.name}, the owner`)) {
    prev.content += "\n" + ownerNote;
  } else {
    if (!prev || prev.role === "assistant") messages.push({ role: "user", content: "[The owner joined the chat]" });
    messages.push({ role: "assistant", content: ownerNote });
  }
  await saveConversation(guest, messages, { ...item, handoffUntil: nextHandoffUntil() });
}

/** Escalate: alert the owner on WhatsApp (falls back to email) and point the owner at this guest. */
async function escalateToOwner(msg, reason) {
  const label = guestLabel(msg.guestName, msg.waId);
  let channel = "email";
  if (pack.owner?.whatsapp) {
    const state = (await loadItem(ownerKey(pack.owner.whatsapp))) || {};
    try {
      channel = await alertOwner(pack, state, label, reason);
      await saveOwnerState({ ...state, activeGuest: msg.waId });
    } catch (err) {
      console.error("owner WhatsApp alert failed:", err.message);
    }
  }
  await notifyOwner(pack, `Don Tuco escalation, ${label}: ${reason}\n\nChat with the guest: https://wa.me/${msg.waId.replace("+", "")}`);
  return channel;
}

export async function handler(event) {
  for (const record of event.Records || []) {
    const inbound = parseInbound(record.Sns?.Message || "{}");
    for (const msg of inbound) {
      if (!msg.text) continue; // media/status events: skip for now
      const t0 = Date.now();

      if (isOwner(pack, msg.waId)) {
        await handleOwner(msg);
        continue;
      }

      const { item, messages } = await loadConversation(msg.waId);

      // The owner has taken over this guest: pass the message on, Don Tuco stays quiet.
      if (handoffActive(item)) {
        const prev = messages[messages.length - 1];
        if (prev?.role === "user" && typeof prev.content === "string") prev.content += "\n" + msg.text;
        else messages.push({ role: "user", content: msg.text });
        await saveConversation(msg.waId, messages, item);
        const label = guestLabel(msg.guestName, msg.waId);
        try {
          const state = (await loadItem(ownerKey(pack.owner.whatsapp))) || {};
          await alertOwner(pack, state, label, msg.text, { howTo: false });
        } catch (err) {
          console.error("owner WhatsApp forward failed:", err.message);
          await notifyOwner(pack, `${label} wrote: ${msg.text}`);
        }
        continue;
      }

      const prefix = messages.length
        ? ""
        : `[Conversation start. Now: ${new Date().toLocaleString("en-US", { timeZone: pack.timezone })} (${pack.timezone}). Guest WhatsApp name: ${msg.guestName || "unknown"}]\n`;
      const last = messages[messages.length - 1];
      if (last?.role === "user" && typeof last.content === "string") last.content += "\n" + msg.text;
      else messages.push({ role: "user", content: prefix + msg.text });

      const ctx = {
        waId: msg.waId,
        sendLocation: (loc) => sendLocation(msg.waId, loc),
        confirmEmail: (booking) => confirmBooking(pack, booking),
        notifyOwner: (text) => notifyOwner(pack, text),
        escalate: (reason) => escalateToOwner(msg, reason),
      };

      const { reply, messages: updated } = await runAgent(pack, messages, ctx);
      if (reply) await sendText(msg.waId, reply);
      await saveConversation(msg.waId, updated, item ? { handoffUntil: item.handoffUntil } : {});

      // CloudWatch EMF metric: the headline stat — reply latency.
      console.log(
        JSON.stringify({
          _aws: {
            Timestamp: Date.now(),
            CloudWatchMetrics: [
              {
                Namespace: "DonTuco",
                Dimensions: [["Operator"]],
                Metrics: [{ Name: "ReplyLatencyMs", Unit: "Milliseconds" }],
              },
            ],
          },
          Operator: pack.operatorId,
          ReplyLatencyMs: Date.now() - t0,
          InboundToReplyMs: msg.timestamp ? Date.now() - msg.timestamp : null,
        })
      );
    }
  }
  return { ok: true };
}
