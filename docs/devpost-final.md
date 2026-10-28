# Devpost final copy: Don Tuco

## Name
Don Tuco: the WhatsApp Host for Tour Operators

## Tagline (max 200)
An agentic WhatsApp concierge for small Latin American tour operators: real availability, bookings, confirmations and owner handoff, on AWS End User Messaging Social, Bedrock and SES.

## Story

## Inspiration
I run the tours at Finca Montezuma, my cacao farm in Dolphin Bay, Bocas del Toro, Panama. You can only reach it by boat, and every booking comes in on one WhatsApp number. Guests write late at night, while I'm on another tour or out on the boat, in Spanish, English or Dutch, and I miss messages and bookings (0:03). Small tour operators across Latin America run their business the same way. A chat widget on their website doesn't help, because their guests are already in WhatsApp.

So Finca Montezuma is my own business. I built Don Tuco, I'm his first customer, and I'm the owner he hands guests to.

Watch the demo (3:00): https://youtu.be/S1BUH-aEncQ. The timestamps below point to the moment in the video.

## What it does
Don Tuco is the farm's toucan host on its WhatsApp Business number, +1 414 261 7820. The demo (0:45) is a real conversation on my phone with the live agent. In it he:

- replies in Spanish and offers the two daily slots (0:51)
- checks availability for Saturday at 11:00 and quotes the total, 4 × $20 = $80 (0:59)
- books after the guest confirms, writes the booking to the ledger and sends a confirmation email through Amazon SES (1:07)
- switches to English when the guest does, and sends a WhatsApp location pin with boat directions (1:16)
- says he is the farm's AI assistant and that a person reads every booking (1:27)
- hands the chat to me when a group is over the limit of 10 (1:35)

Outside the demo he also checks my Google Calendar before he offers a slot, so a private group or a day off blocks it, and he writes every booking into that calendar. He reads an existing booking from the ledger instead of trusting the chat history. When a guest needs a boat, he asks where they leave from, suggests a time (the ride from Bocas Town takes 25 to 30 minutes) and sends me the pickup details.

The handoff stays in WhatsApp. The alert reaches my own WhatsApp, I answer in that chat, and Don Tuco passes my message to the guest from the business number, then stays quiet for that guest until I send `#bot`. Outside Meta's 24-hour window the alert has to be a message template. I submitted the utility template `don_tuco_handoff` and it is still waiting for Meta's review, so for now that case falls back to an email with a tap-to-chat link.

## One JSON file per operator (2:17)
The engine knows nothing about cacao. Tours, prices, time slots, languages, FAQ, arrival notes and email settings live in `packs/<operator>.json`. The next operator is the next file. In the video (2:47) that is Papito's Nature Tours, my partner's boat tour company, whose website bocasnaturetours.com I built.

## How I built it (1:39)
- **AWS End User Messaging Social (WhatsApp)** is both the event source and the reply channel. Inbound messages arrive as Meta webhook entries on Amazon SNS, and replies, location pins, interactive lists and templates go out through `SendWhatsAppMessage` as Meta Cloud API JSON. There is no BSP and no webhook server to host.
- **AWS Lambda (Node 22)** runs a Claude tool-use loop on **Amazon Bedrock** with six tools: `check_availability`, `quote_tour`, `book_tour`, `get_my_bookings`, `send_location`, `escalate`.
- **Amazon DynamoDB** holds the booking ledger, the 24-hour conversation state (its TTL matches Meta's customer-service window) and the handoff state.
- **Google Calendar API**, through a service account signed with node:crypto: my own events block overlapping slots, with each tour's length taken into account, and each booking becomes an event. A calendar outage never blocks a booking.
- **Amazon SES** sends guest confirmations and my booking and handoff emails.
- **Amazon CloudWatch** records reply latency for every message.
- The infrastructure is one CloudFormation template.

## Measured on the live number (2:05)
- **8.0 seconds median** from a guest sending a WhatsApp message to Don Tuco's reply arriving, over 14 real replies on the live number between Oct 26 and 27, 2026. All 14 came from my own test conversations. The agent itself took a median of 3.9 seconds; the rest is WhatsApp delivery. In the demo the replies take 5 to 9 seconds, and each one is stamped on screen.
- **About 1 cent of AI per reply** (about 2,600 input tokens per call), and about 2 cents with WhatsApp delivery at list prices.
- Benchmark, from an AWS partner webinar in October 2026: Latin America is over 40% of global WhatsApp Business adoption, and 68% of people say WhatsApp is the easiest way to contact a business.

## Challenges I ran into
- **One failed email caused a double booking.** In the SES sandbox a confirmation email failed after the booking was saved. The tool reported an error, the model booked again, ran into its own 14:00 booking and booked 11:00, which nobody had asked for. Email failures are now reported without failing the booking, and the same guest rebooking the same slot updates it.
- **Old facts in the chat history.** Don Tuco repeated a 45-minute boat ride from earlier in a conversation after I had corrected it to 25 to 30 minutes. Facts from the operator pack now outrank the chat history, and booking times always come from the ledger.
- **A promise without the action.** He told me he would alert the owner and never called the tool. He can't promise a handoff now unless he calls `escalate` in the same turn, and I test that against the conversation that failed.
- **Meta business verification.** My first WhatsApp Business Account was blocked by a rejected portfolio verification, so I set it up again under a clean portfolio.

## What I learned
Most of the work went into the rules around the model: availability only from the tools, no promise unless the tool call that keeps it happens in the same turn, and a fast handoff to a person.

## What's next for Don Tuco
Day-before reminder templates, payment links for larger groups, understanding voice notes, and cancellations that remove the calendar event. Then Papito's Nature Tours and the other Bocas del Toro operators I build websites for (2:38).

## Try it
Message **+1 414 261 7820** on WhatsApp in Spanish, English or Dutch. Ask about tours, a date, the price for your group and how to get to the farm, then book. Ask "are you a bot?" to see the AI disclosure, or ask for a discount to trigger the handoff.

- Test bookings are welcome. They land in the farm's real calendar and ledger, and I remove them by hand.
- Amazon SES for this account is still in the sandbox, so confirmation emails only reach my verified addresses. The booking itself is saved and confirmed in WhatsApp for everyone.

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
