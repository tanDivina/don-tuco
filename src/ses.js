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
    );
  }
  await sendEmail(
    pack.email.fromAddress,
    pack.email.ownerNotify,
    `[Don Tuco] New booking: ${booking.date} ${booking.time} ×${booking.people}`,
    JSON.stringify(booking, null, 2)
  );
}

export async function notifyOwner(pack, message) {
  await sendEmail(pack.email.fromAddress, pack.email.ownerNotify, "[Don Tuco] Needs a human", message);
}
