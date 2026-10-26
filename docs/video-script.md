# Don Tuco — demo video script (~3:00)

Format: vertical-friendly screen recording of a real WhatsApp chat + architecture cutaways.
Narration can reuse the ElevenLabs pipeline from the PoquiTareas/Rooted promos.
Every stat on screen gets a MEASURED or BENCHMARK label (Dorien's standing rule).

## 0:00–0:25 — The problem (the wedge, requirement #2)
*B-roll: boat to the farm / cacao grove. Phone screen: WhatsApp full of unread guest messages.*

> "Small tour operators across Latin America run their whole business on one personal WhatsApp number. This is Finca Montezuma, a cacao farm in Bocas del Toro, Panamá. Guests write at 10pm. They write in Spanish, English, Dutch. And they write while the owner is on a boat with no hands free. BENCHMARK on screen: most travel inquiries arrive outside business hours — and the first reply usually wins the booking."

## 0:25–0:40 — Meet Don Tuco
*Ink-toucan mascot reveal. Tagline card: "Every guest greeted in seconds, every booking in the ledger."*

> "Meet Don Tuco — the farm's AI host, living natively in WhatsApp on AWS End User Messaging Social."

## 0:40–1:50 — Live demo (the core 70 seconds)
*Real phone, real WhatsApp, screen-recorded. Timer overlay showing reply latency (MEASURED).*

1. Guest (Spanish): "Hola! ¿Tienen tour de cacao el sábado para 4 personas?" → Don Tuco replies in seconds, in Spanish, with a **tappable slot list** (11:00 / 14:00).
2. Guest taps 11:00 → Don Tuco quotes: 4 × $20 = $80, asks for a name.
3. Guest switches to English mid-chat: "Actually, can we do the chocolate workshop instead?" → Don Tuco follows the language switch, re-quotes 4 × $40.
4. Guest confirms → booking recorded. *Cut to:* SES confirmation email landing in the guest's inbox; owner notification on Dorien's phone.
5. Guest: "How do we get there?" → **location pin** drops in the chat + boat instructions.
6. Guest: "Are you a real person?" → Don Tuco: he's the farm's AI assistant; a human reads every booking. *(honesty beat)*
7. Quick escalate beat: "We're a group of 14" → "Let me get the owner for you" → owner email arrives.

## 1:50–2:20 — Architecture (requirement #3: one JSON = one customer)
*Animated diagram: WhatsApp → EUM Social → SNS → Lambda (Bedrock agent + tools) → SendWhatsAppMessage / SES / DynamoDB.*

> "AWS End User Messaging Social delivers every guest message to SNS — no webhook servers, no Meta app review. A Lambda runs a Claude agent on Amazon Bedrock with five tools: availability, quotes, bookings, location, and escalation. DynamoDB keeps the ledger, SES sends confirmations. And everything specific to this farm lives in ONE config file. *[Show packs/finca-montezuma.json scrolling]* Onboarding the next operator is writing one JSON."

## 2:20–2:50 — Business story (requirement #1: customer #1 + pipeline)
*Cards: Finca Montezuma logo → pipeline logos/names of tourism clients.*

> "Finca Montezuma is customer number one — a real farm, really taking bookings this way. As an AWS partner we already audit and build for tour operators across Bocas and the Caribbean: that pipeline is the go-to-market, one config pack per operator, with an ACE opportunity behind it. MEASURED on screen: median reply latency from CloudWatch — __ seconds, versus hours for a human mid-tour."

## 2:50–3:00 — Close
*Mascot + URL card.*

> "Don Tuco — every guest greeted in seconds, every booking in the ledger. Built on AWS End User Messaging Social, Amazon Bedrock, and Amazon SES."

## Shot checklist
- [ ] Real WhatsApp chat recording (phone, clean notifications)
- [ ] Latency timer overlay (use CloudWatch numbers, label MEASURED)
- [ ] SES email landing shot
- [ ] Location pin shot
- [ ] packs/finca-montezuma.json scroll
- [ ] Architecture animation (reuse Remotion setup from finca-montezuma-promo)
- [ ] Ink-toucan mascot stills (NO stock/cartoon icons — custom, Maître style)
