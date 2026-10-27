// Don Tuco's brain: a manual tool-use loop on Claude via Amazon Bedrock.
// The agent is operator-agnostic — everything business-specific comes from the pack.
import { AnthropicBedrockMantle, AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { makeTools, executeTool } from "./tools.js";

const MODEL_ID = process.env.MODEL_ID || "anthropic.claude-opus-5-5";
const MAX_TURNS = 8;
const REGION = process.env.AWS_REGION || "us-east-1";

// Mantle (Claude Platform on AWS) serves current-gen bare `anthropic.<model>` ids.
// Inference-profile (`us.`/`global.`) and dated-snapshot ids go through the
// classic Bedrock runtime, which needs the Bedrock API version header.
const useLegacy = /^(us|eu|apac|global)\./.test(MODEL_ID) || /-v\d+:\d+$/.test(MODEL_ID);
const client = useLegacy
  ? new AnthropicBedrock({
      awsRegion: REGION,
      defaultHeaders: { "anthropic-version": "bedrock-2023-05-31" },
    })
  : new AnthropicBedrockMantle({ awsRegion: REGION });

export function systemPrompt(pack) {
  const tourLines = pack.tours
    .map(
      (t) =>
        `- ${t.name.en} (${t.id}): $${t.pricePerPerson}/person, ${t.durationMinutes} min — ${t.description.en}`
    )
    .join("\n");
  const faqLines = pack.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n");
  return `You are Don Tuco, the toucan host of ${pack.businessName} (${pack.location.description}). You answer the business's WhatsApp as its booking concierge.

Character: a courtly, warm finca host. Big beak, quick reply. Gracious but brief: WhatsApp style, 1–4 short sentences per message, no bullet-point walls. Never use em dashes; write with commas, colons, or separate sentences. You keep the guest ledger and never double-book.

Languages: reply in the language the guest writes in (you speak ${pack.languages.join(", ")}). Default to ${pack.defaultLanguage} if unclear.

Honesty rules:
- If asked whether you are a bot or human, say plainly you are ${pack.businessName}'s AI assistant and a human owner reads every booking.
- Never invent availability, prices, or facts. Everything comes from your tools and the catalog below.
- The ledger outranks this conversation. Before telling a guest the date or time of an existing reservation, or changing one, call get_my_bookings and state what the ledger says. Past messages may be stale: a booking may have been corrected since.
- Report tool problems only when they happen in the current exchange. Never carry forward an old apology (an email glitch, a taken slot) from earlier in the chat as if it were still true.
- Use the escalate tool for: complaints, discounts/price exceptions, groups larger than ${pack.maxGroupSize}, or anything you are not sure about. Tell the guest a human will follow up shortly.

Booking flow:
1. Find out which tour, which date/time, how many people, and a name.
2. Use check_availability before offering any slot. Offer alternatives from its output if the requested slot is taken. Standard slots: ${pack.standardSlots.join(" and ")} (${pack.timezone}).
3. Confirm the total price out loud before booking.
4. Use book_tour only after the guest explicitly confirms. Ask for an email (optional) so we can send a confirmation.
5. If the guest asks where the farm is or how to arrive, use send_location.

Tour catalog:
${tourLines}

Arrival: ${pack.location.arrivalNotes}

FAQ knowledge:
${faqLines}

Today's date and time are given in each conversation's first message.`;
}

/**
 * Run the agent over a conversation.
 * @param {object} pack operator config pack
 * @param {Array} messages prior Anthropic-format messages (incl. the new user turn)
 * @param {object} ctx { waId, sendLocation(), notifyOwner(), confirmEmail() } side-effect handlers
 * @returns {{ reply: string, messages: Array, bookings: Array }}
 */
export async function runAgent(pack, messages, ctx) {
  const tools = makeTools(pack);
  const bookings = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 2048,
      // WhatsApp replies must be snappy; effort only exists on current-gen models
      ...(useLegacy ? {} : { output_config: { effort: "low" } }),
      system: systemPrompt(pack),
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") break;

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const results = [];
    for (const tu of toolUses) {
      try {
        const out = await executeTool(pack, tu.name, tu.input, ctx);
        if (tu.name === "book_tour" && out.booked) bookings.push(out.booking);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        });
      } catch (err) {
        console.error(`tool ${tu.name} failed:`, err.message);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  const last = messages[messages.length - 1];
  const reply =
    last.role === "assistant"
      ? last.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim()
      : "";
  return { reply, messages, bookings };
}
