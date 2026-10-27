// Amazon SES: booking confirmation to the guest, notification to the owner.
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({});

async function sendEmail(from, to, subject, text) {
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
    })
  );
}

export async function confirmBooking(pack, booking) {
  const tour = pack.tours.find((t) => t.id === booking.tourId);
  const total = tour ? tour.pricePerPerson * booking.people : "?";
  // The owner notice must go out even when the guest's confirmation fails.
  let guestError = null;
  if (booking.guestEmail) {
    await sendEmail(
      pack.email.fromAddress,
      booking.guestEmail,
      `Booking confirmed: ${tour?.name.en} at ${pack.businessName}`,
      [
        `¡Confirmado! / Confirmed!`,
        ``,
        `${tour?.name.en} on ${booking.date} at ${booking.time}`,
        `Guests: ${booking.people} · Total: $${total} ${pack.currency} (cash at the farm)`,
        `Name: ${booking.guestName}`,
        ``,
        `Getting there: ${pack.location.arrivalNotes}`,
        ``,
        `Questions? Reply in the same WhatsApp chat any time, Don Tuco is awake.`,
      ].join("\n")
    ).catch((err) => (guestError = err));
  }
  const kind = booking.updatedAt ? "Booking updated" : "New booking";
  const chat = booking.waId ? `https://wa.me/${booking.waId.replace("+", "")}` : "";
  await sendEmail(
    pack.email.fromAddress,
    pack.email.ownerNotify,
    `[Don Tuco] ${kind}: ${tour?.name.en || booking.tourId}, ${booking.date} ${booking.time}, ${booking.people} people`,
    [
      `${kind} via WhatsApp`,
      ``,
      `Tour:   ${tour?.name.en || booking.tourId}`,
      `Date:   ${booking.date} at ${booking.time}`,
      `Guests: ${booking.people}`,
      `Total:  $${total} ${pack.currency} (cash at the farm)`,
      `Name:   ${booking.guestName || "-"}`,
      `Email:  ${booking.guestEmail || "-"}${booking.guestEmail ? (guestError ? " (confirmation could not be sent)" : " (confirmation sent)") : ""}`,
      booking.notes ? `Notes:  ${booking.notes}` : null,
      ``,
      chat ? `Chat with the guest: ${chat}` : null,
      `Booking id: ${booking.id}`,
    ]
      .filter((l) => l !== null)
      .join("\n")
  );
  if (guestError) throw guestError;
}

export async function notifyOwner(pack, message) {
  await sendEmail(pack.email.fromAddress, pack.email.ownerNotify, "[Don Tuco] Needs a human", message);
}
