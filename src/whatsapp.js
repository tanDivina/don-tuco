// AWS End User Messaging Social transport: parse inbound SNS events, send replies.
// SendWhatsAppMessage passes native Meta Cloud API JSON through AWS — so text,
// interactive lists/buttons, media, and location pins all work.
// NOTE: verify field casing against the deployed @aws-sdk/client-socialmessaging
// version on first deploy; the message payload itself is standard Meta format.
import {
  SocialMessagingClient,
  SendWhatsAppMessageCommand,
} from "@aws-sdk/client-socialmessaging";

const client = new SocialMessagingClient({});
const ORIGINATION_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const META_API_VERSION = process.env.META_API_VERSION || "v20.0";

/** Extract inbound guest messages from an EUM Social SNS record. */
export function parseInbound(snsMessage) {
  const body = typeof snsMessage === "string" ? JSON.parse(snsMessage) : snsMessage;
  // EUM Social wraps the Meta webhook entry; it may arrive as a JSON string.
  let entry = body.whatsAppWebhookEntry ?? body.entry ?? body;
  if (typeof entry === "string") entry = JSON.parse(entry);
  const entries = Array.isArray(entry) ? entry : [entry];
  const out = [];
  for (const e of entries) {
    for (const change of e.changes || []) {
      const value = change.value || {};
      for (const msg of value.messages || []) {
        out.push({
          waId: msg.from,
          messageId: msg.id,
          timestamp: Number(msg.timestamp) * 1000,
          type: msg.type,
          text: msg.text?.body || msg.interactive?.list_reply?.title || msg.interactive?.button_reply?.title || "",
          guestName: value.contacts?.[0]?.profile?.name || "",
        });
      }
    }
  }
  return out;
}

async function send(metaMessage) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    ...metaMessage,
  };
  await client.send(
    new SendWhatsAppMessageCommand({
      originationPhoneNumberId: ORIGINATION_ID,
      metaApiVersion: META_API_VERSION,
      message: new TextEncoder().encode(JSON.stringify(payload)),
    })
  );
}

export async function sendText(to, text) {
  await send({ to, type: "text", text: { body: text } });
}

export async function sendLocation(to, loc) {
  await send({
    to,
    type: "location",
    location: {
      latitude: loc.latitude,
      longitude: loc.longitude,
      name: loc.description,
    },
  });
}

/** Interactive list of open slots — the tappable date picker. */
export async function sendSlotList(to, headerText, slots) {
  await send({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: headerText },
      action: {
        button: "Choose a slot",
        sections: [
          {
            title: "Open slots",
            rows: slots.slice(0, 10).map((s) => ({ id: s.id, title: s.title, description: s.description || "" })),
          },
        ],
      },
    },
  });
}
