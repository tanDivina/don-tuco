# Devpost final copy: Don Tuco

## Name
Don Tuco: the WhatsApp Host for Tour Operators

## Tagline (max 200)
An agentic WhatsApp concierge for small Latin American tour operators: real availability, bookings, confirmations and owner handoff, on AWS End User Messaging Social, Bedrock and SES.

## Story

## Inspiration
Small tour operators across Latin America run their whole business on one personal WhatsApp number. A website chat widget does not help, because the guests are already in WhatsApp. They write at 10pm, mid-tour, in Spanish, English or Dutch, and the first operator to reply usually wins the booking.

Our first customer, Finca Montezuma, is a cacao farm in Dolphin Bay, Bocas del Toro, Panamá, reachable only by boat. Until now its bookings depended on the owner seeing each message and typing the reply by hand, often from a boat with no hands free.

## What it does
Don Tuco is the toucan host of the farm, living on the operator's WhatsApp Business number. He:

- answers in the guest's language (Spanish, English, Dutch)
- checks real availability against the booking ledger and the operator's Google Calendar, and never double-books
- writes every booking into the operator's Google Calendar, so the owner sees the day at a glance
- quotes the total price and books only after the guest confirms
- looks up a guest's existing booking from the ledger, not from chat memory
- sends the farm's location pin and plans the boat ride (25 to 30 minutes from Bocas Town)
- emails a booking confirmation through Amazon SES
- says plainly that he is an AI when asked
- hands off to the human owner for complaints, discounts, large groups, boat captains, or anything he is unsure about

**Owner handoff over WhatsApp.** An escalation reaches the owner on their own WhatsApp. The owner answers in that chat and Don Tuco passes the message to the guest from the business number, then stays quiet for that guest until the owner sends `#bot`. Outside Meta's 24-hour window the alert goes out as an approved utility template, and the owner's reply reopens the window. An email with a tap-to-chat link is the backup.

## One JSON file = one new customer
The agent engine knows nothing about cacao. Tours, prices, time slots, languages, FAQ, location, arrival notes, owner contact and email settings all live in `packs/<operator>.json`. Onboarding the next operator is writing one file, not changing code.

## How we built it
- **AWS End User Messaging Social (WhatsApp)** is both the event source and the reply channel: inbound messages arrive as Meta webhook entries on Amazon SNS, and replies, location pins, interactive lists and templates go out through `SendWhatsAppMessage` as native Meta Cloud API JSON. No BSP, no webhook server to host.
- **AWS Lambda (Node 22)** runs a Claude tool-use loop on **Amazon Bedrock** with six tools: `check_availability`, `quote_tour`, `book_tour`, `get_my_bookings`, `send_location`, `escalate`.
- **Amazon DynamoDB** holds the booking ledger and 24-hour conversation state (TTL matches Meta's customer-service window), plus owner handoff state.
- **Amazon SES** sends guest confirmations and owner alerts.
- **Google Calendar API** (service account, signed with node:crypto, no extra dependencies): the operator's own events block overlapping slots, tour length included, and each booking becomes a calendar event. A calendar outage never blocks a booking.
- **Amazon CloudWatch** records reply latency as an embedded metric on every message.
- Infrastructure is one CloudFormation template.

## Measured, not estimated
- **Median 8.0 seconds** from the guest sending a WhatsApp message to Don Tuco's reply arriving, across 14 real replies on the live number (Oct 26 to 27, 2026). The agent itself takes a median of 3.9 seconds; the rest is WhatsApp delivery.
- **About 1 cent of AI per reply** (about 2.6k input tokens per call), and about 2 cents all-in at list prices including WhatsApp delivery.
- Benchmark (AWS partner webinar, Oct 2026): Latin America is over 40% of global WhatsApp Business adoption, and 68% of people say WhatsApp is the easiest way to contact a business.

## Challenges we ran into
- **A cascade from one email.** SES sandbox rejected a confirmation email after the booking was saved, the tool reported an error, the model rebooked, collided with its own booking and offered a different slot. Email failures are now non-fatal, and rebooking the same slot by the same guest is idempotent.
- **Stale facts in chat history.** The agent repeated an old travel time from earlier in the conversation. Facts from the operator pack now outrank chat history, and booking times always come from the ledger.
- **Promises without actions.** The model said it would notify the owner without calling the tool. The prompt now forbids any handoff promise without the escalate call in the same turn, and we test it against the real conversation that failed.
- **Meta business verification.** Our first WhatsApp Business Account was blocked by a rejected portfolio verification; we rebuilt under a clean portfolio.

## Accomplishments that we're proud of
A real guest can message the live number today, get an answer in seconds, book, and get handed to the owner without the owner ever leaving WhatsApp.

## What we learned
On WhatsApp the hard part is not the language model, it is the honesty around it: never inventing availability, never promising what the tools did not do, and getting a human in fast.

## What's next for Don Tuco
Day-before reminder templates, payment links for larger groups, voice-note understanding, cancellations that clear the calendar event, and onboarding the next Bocas del Toro operators from our pipeline (Barefoot, Travel Twitch, Herbivore).

## Built with
amazon-web-services, aws-end-user-messaging, amazon-bedrock, claude, aws-lambda, amazon-dynamodb, amazon-ses, amazon-sns, amazon-cloudwatch, aws-cloudformation, node.js, whatsapp

## Links
- Live site: https://dontuco.hero-apps.com
- Code: https://github.com/tanDivina/don-tuco (MIT)
- Try it: WhatsApp +1 414 261 7820
- ACE opportunity: O30398370

## Testing instructions
Message +1 414 261 7820 on WhatsApp in Spanish, English or Dutch. Ask about tours, availability for a date, the price for your group, and how to get to the farm; then book. Ask "are you a bot?" to see the AI disclosure, or ask for a discount to trigger the owner handoff.
Note: Amazon SES for this account is still in the sandbox, so booking confirmation emails only reach our verified addresses. The booking itself is saved and confirmed in WhatsApp for everyone.
