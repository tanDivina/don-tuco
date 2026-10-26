// Lambda entrypoint: SNS (EUM Social inbound WhatsApp) → Don Tuco → reply.
// Conversation state lives in DynamoDB keyed by WhatsApp user id, TTL 24h —
// matching Meta's customer-service window.
import { readFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { runAgent } from "./agent.js";
import { parseInbound, sendText, sendLocation } from "./whatsapp.js";
import { confirmBooking, notifyOwner } from "./ses.js";

const pack = JSON.parse(
  readFileSync(new URL(`../packs/${process.env.OPERATOR_PACK || "finca-montezuma"}.json`, import.meta.url))
);
const CONVO_TABLE = process.env.CONVERSATIONS_TABLE;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function loadConversation(waId) {
  const res = await ddb.send(new GetCommand({ TableName: CONVO_TABLE, Key: { waId } }));
  return res.Item ? JSON.parse(res.Item.messages) : [];
}

async function saveConversation(waId, messages) {
  await ddb.send(
    new PutCommand({
      TableName: CONVO_TABLE,
      Item: {
        waId,
        messages: JSON.stringify(messages),
        ttl: Math.floor(Date.now() / 1000) + 24 * 3600,
      },
    })
  );
}

export async function handler(event) {
  for (const record of event.Records || []) {
    const inbound = parseInbound(record.Sns?.Message || "{}");
    for (const msg of inbound) {
      if (!msg.text) continue; // media/status events: skip for now
      const t0 = Date.now();

      const messages = await loadConversation(msg.waId);
      const prefix = messages.length
        ? ""
        : `[Conversation start. Now: ${new Date().toLocaleString("en-US", { timeZone: pack.timezone })} (${pack.timezone}). Guest WhatsApp name: ${msg.guestName || "unknown"}]\n`;
      messages.push({ role: "user", content: prefix + msg.text });

      const ctx = {
        waId: msg.waId,
        sendLocation: (loc) => sendLocation(msg.waId, loc),
        confirmEmail: (booking) => confirmBooking(pack, booking),
        notifyOwner: (text) => notifyOwner(pack, text),
      };

      const { reply, messages: updated } = await runAgent(pack, messages, ctx);
      if (reply) await sendText(msg.waId, reply);
      await saveConversation(msg.waId, updated);

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
