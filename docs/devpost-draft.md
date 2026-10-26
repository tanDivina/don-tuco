# Devpost draft — Don Tuco

**Hackathon:** AWS CDS Agentic AI Partner Hackathon · aws-cds-partner.devpost.com
**Deadline:** Oct 28, 2026, 1:00 PM PDT · targets the **Meta WhatsApp Prize** (built on EUM Social)
**Partner:** Divina Endeavors LLC · **Customer:** Finca Montezuma (Bocas del Toro, Panamá)
**ACE:** ⚠️ needs a NEW net-new opportunity (separate from Lucienne's O30226356), campaign code `AWS CDS Agentic AI Hackathon -Sept. 2026`

## Title
Don Tuco — the WhatsApp Host for Tour Operators

## Tagline
Every guest greeted in seconds, every booking in the ledger. An agentic WhatsApp concierge on AWS End User Messaging Social, Bedrock, and SES.

## Inspiration (the wedge — requirement #2)
Small tour operators across Latin America run their entire business on a personal WhatsApp number. No website widget fixes that, because the guests are already *in WhatsApp*. Inquiries arrive at 10pm, mid-tour, in three languages — and the first business to reply usually wins the booking. Our own customer ran tours this way: a desktop copilot generated replies that the owner pasted into WhatsApp by hand, and only while awake.

## What it does
Don Tuco answers the operator's WhatsApp Business number as a bilingual-plus (ES/EN/NL) booking concierge: checks real availability, quotes prices, sends tappable slot lists and the farm's location pin, records bookings, emails confirmations via SES, and escalates to the human owner for complaints, discounts, or anything he's unsure about. He discloses he's an AI when asked.

## Customer #1 + pipeline (requirement #1)
Live at **Finca Montezuma**, a working cacao farm in Dolphin Bay, Bocas del Toro. Go-to-market is our existing tourism-client pipeline — Caribbean and Bocas del Toro tour operators we already audit and build websites for — each onboarded as one config pack. This is the partner model the ACE opportunity captures: one solution, repeat AWS consumption per customer.

## One JSON = one new customer (requirement #3)
The agent engine is operator-agnostic. Tours, prices, slots, languages, FAQ, location, and escalation live in `packs/<operator>.json`. Onboarding customer #2 is writing one file — shown in the demo and the architecture diagram.

## Stats (requirement #4 — label each as MEASURED or BENCHMARK in the final copy)
- MEASURED: median Don Tuco reply latency, from CloudWatch `DonTuco/ReplyLatencyMs` (fill in after test runs: ~__s vs. hours for a mid-tour human).
- BENCHMARK: majority of travel inquiries arrive outside business hours; first responder wins most conversions (cite sources in final copy — verify before submitting).
- MEASURED: bookings recorded end-to-end in demo, with SES confirmation delivery time.

## How we built it
AWS End User Messaging Social (WhatsApp) → SNS → Lambda (Node 22) running a Claude tool-use loop on Amazon Bedrock, with DynamoDB for bookings + 24h conversation state (TTL = Meta's customer-service window) and SES for confirmations and owner escalation. Outbound messages are native Meta Cloud API JSON through `SendWhatsAppMessage` — interactive lists, buttons, location pins. Multiple CDS services: **EUM Social + SES**.

## Meta WhatsApp Prize statement
AWS End User Messaging Social is not a channel bolted onto this product — it *is* the product. Don Tuco exists entirely inside WhatsApp, the app Latin American guests already use, with EUM Social as both event source (webhook entries via SNS) and reply API (free-form session messages inside the 24-hour window, so no template-approval dependency; reminder templates are the roadmap).

## What's next
Day-before reminder templates (Meta utility templates), payment links for large groups, voice-note understanding, and onboarding the next operators from the pipeline.

## Submission checklist
- [ ] New ACE opportunity created (net-new, after Sep 14 2026, campaign code above) — **do first, it needs approval time**
- [ ] Dedicated WhatsApp number acquired + Meta embedded signup in EUM console (Dorien)
- [ ] Deploy stack, wire SNS destination, end-to-end test on real WhatsApp
- [ ] Repo public with MIT license (or shared with judge accounts)
- [ ] Architecture diagram PNG exported from README mermaid
- [ ] ~3 min video (public YouTube, no copyrighted music) — see video-script.md
- [ ] Testing access instructions (judge can message the number)
- [ ] Submit on Devpost before Oct 28, 1:00 PM PDT
