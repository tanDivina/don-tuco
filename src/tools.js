// Don Tuco's booking tools. Availability logic ported from tour-desk-mac,
// backed by DynamoDB (or an in-memory store when running the local CLI).
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { calendarEnabled, blockedSlots, upsertBookingEvent } from "./gcal.js";

const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || "";
const ddb = BOOKINGS_TABLE
  ? DynamoDBDocumentClient.from(new DynamoDBClient({}))
  : null;
const memoryBookings = []; // local CLI fallback

export function makeTools(pack) {
  return [
    {
      name: "check_availability",
      description:
        "Check whether a tour slot is free on a given date, considering existing bookings and the farm calendar. Always call this before offering or booking a slot. Returns the slot status plus open alternatives.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "ISO date, e.g. 2026-10-31" },
          time: { type: "string", description: `Slot time HH:MM, normally one of ${pack.standardSlots.join(", ")}` },
          tourId: { type: "string", description: "Tour id if known; longer tours need a longer free window" },
        },
        required: ["date", "time"],
      },
    },
    {
      name: "quote_tour",
      description: "Compute the total price for a tour and group size.",
      input_schema: {
        type: "object",
        properties: {
          tourId: { type: "string", enum: pack.tours.map((t) => t.id) },
          people: { type: "integer", minimum: 1 },
        },
        required: ["tourId", "people"],
      },
    },
    {
      name: "book_tour",
      description:
        "Record a confirmed booking in the ledger. Only call after the guest has explicitly confirmed tour, date, time, group size, and price. Triggers the email confirmation if an email was given.",
      input_schema: {
        type: "object",
        properties: {
          tourId: { type: "string", enum: pack.tours.map((t) => t.id) },
          date: { type: "string" },
          time: { type: "string" },
          people: { type: "integer", minimum: 1 },
          guestName: { type: "string" },
          guestEmail: { type: "string", description: "Optional" },
          notes: { type: "string", description: "Optional — dietary, boat help, etc." },
        },
        required: ["tourId", "date", "time", "people", "guestName"],
      },
    },
    {
      name: "get_my_bookings",
      description:
        "Look up this guest's existing bookings in the ledger. The ledger is the source of truth: use it whenever the guest asks about their reservation, wants to change it, or the conversation history is unclear about what was booked. Never state a booked date or time from memory.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "send_location",
      description:
        "Send the farm's location pin to the guest on WhatsApp. Use when they ask where the farm is or how to get there.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "escalate",
      description:
        "Notify the human owner to take over this conversation. Use for complaints, price exceptions, oversized groups, or anything you are unsure about.",
      input_schema: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
    },
  ];
}

async function listBookings(operatorId, date) {
  if (!ddb) return memoryBookings.filter((b) => b.date === date);
  const res = await ddb.send(
    new QueryCommand({
      TableName: BOOKINGS_TABLE,
      KeyConditionExpression: "operatorId = :o AND begins_with(sk, :d)",
      ExpressionAttributeValues: { ":o": operatorId, ":d": date },
    })
  );
  return res.Items || [];
}

async function saveBooking(booking) {
  if (!ddb) {
    memoryBookings.push(booking);
    return;
  }
  await ddb.send(
    new PutCommand({
      TableName: BOOKINGS_TABLE,
      Item: { ...booking, sk: `${booking.date}#${booking.time}#${booking.id}` },
    })
  );
}

export async function executeTool(pack, name, input, ctx) {
  switch (name) {
    case "check_availability": {
      const dayBookings = await listBookings(pack.operatorId, input.date);
      const taken = new Set(dayBookings.map((b) => b.time));
      // The operator's own calendar events (private groups, days off) block slots too.
      if (calendarEnabled()) {
        const tour = pack.tours.find((t) => t.id === input.tourId);
        const minutes = tour?.durationMinutes || Math.max(...pack.tours.map((t) => t.durationMinutes));
        try {
          const slots = [...new Set([...pack.standardSlots, input.time])];
          for (const s of await blockedSlots(pack, input.date, slots, minutes)) taken.add(s);
        } catch (err) {
          console.error("calendar availability check failed, using bookings only:", err.message);
        }
      }
      const mine = dayBookings.find((b) => b.time === input.time && b.waId === ctx.waId);
      if (mine) {
        return {
          date: input.date,
          time: input.time,
          available: false,
          alreadyYours: true,
          note: "This guest already holds this slot. It is their confirmed booking, not a conflict.",
          booking: { id: mine.id, guestName: mine.guestName, people: mine.people, tourId: mine.tourId },
        };
      }
      const free = !taken.has(input.time);
      const alternatives = pack.standardSlots.filter((s) => !taken.has(s) && s !== input.time);
      return { date: input.date, time: input.time, available: free, openAlternatives: alternatives };
    }
    case "quote_tour": {
      const tour = pack.tours.find((t) => t.id === input.tourId);
      if (!tour) return { error: "unknown tour" };
      return {
        tour: tour.name.en,
        people: input.people,
        pricePerPerson: tour.pricePerPerson,
        total: tour.pricePerPerson * input.people,
        currency: pack.currency,
      };
    }
    case "book_tour": {
      const sameSlot = (await listBookings(pack.operatorId, input.date)).filter(
        (b) => b.time === input.time
      );
      const own = sameSlot.find((b) => b.waId === ctx.waId);
      const foreign = sameSlot.find((b) => b.waId !== ctx.waId);
      if (foreign && !own) {
        return { booked: false, reason: "that slot is held by another guest's booking; offer an alternative" };
      }
      if (!own && calendarEnabled()) {
        const tour = pack.tours.find((t) => t.id === input.tourId);
        try {
          const blocked = await blockedSlots(pack, input.date, [input.time], tour?.durationMinutes || 120);
          if (blocked.length) return { booked: false, reason: "the operator's calendar is busy at that time; offer an alternative" };
        } catch (err) {
          console.error("calendar check before booking failed:", err.message);
        }
      }

      // Re-booking the guest's own slot is an update (e.g. adding an email), never a conflict.
      const booking = own
        ? {
            ...own,
            guestName: input.guestName || own.guestName,
            guestEmail: input.guestEmail || own.guestEmail,
            notes: input.notes || own.notes,
            people: input.people || own.people,
            updatedAt: new Date().toISOString(),
          }
        : {
            id: `bk_${Date.now().toString(36)}`,
            operatorId: pack.operatorId,
            ...input,
            createdAt: new Date().toISOString(),
            channel: "whatsapp",
            waId: ctx.waId,
          };
      // Put it in the operator's Google Calendar; a calendar hiccup never un-books a guest.
      if (calendarEnabled()) {
        try {
          booking.calendarEventId = await upsertBookingEvent(pack, booking);
        } catch (err) {
          console.error("calendar event failed:", err.message);
        }
      }
      await saveBooking(booking);

      // Email problems must never un-book a guest: report them, don't throw.
      let emailSent = false, emailError = null;
      try {
        if (ctx.confirmEmail) await ctx.confirmEmail(booking);
        emailSent = Boolean(booking.guestEmail);
      } catch (err) {
        emailError = err.message;
        console.error("confirmEmail failed:", err.message);
      }
      return {
        booked: true,
        updated: Boolean(own),
        booking,
        emailSent,
        ...(emailError ? { emailNote: "confirmation email could not be sent; booking is still recorded" } : {}),
      };
    }
    case "get_my_bookings": {
      const all = ddb
        ? (
            await ddb.send(
              new QueryCommand({
                TableName: BOOKINGS_TABLE,
                KeyConditionExpression: "operatorId = :o",
                ExpressionAttributeValues: { ":o": pack.operatorId },
              })
            )
          ).Items || []
        : memoryBookings;
      const mine = all
        .filter((b) => b.waId === ctx.waId)
        .map((b) => ({
          id: b.id, tourId: b.tourId, date: b.date, time: b.time,
          people: b.people, guestName: b.guestName, guestEmail: b.guestEmail || null,
        }));
      return { bookings: mine, note: mine.length ? "These ledger entries are the truth; correct the guest gently if the chat said otherwise." : "No bookings in the ledger for this guest." };
    }
    case "send_location": {
      if (ctx.sendLocation) await ctx.sendLocation(pack.location);
      return { sent: true, note: "Location pin delivered. You can also describe the boat arrival." };
    }
    case "escalate": {
      if (ctx.escalate) {
        const channel = await ctx.escalate(input.reason);
        return { escalated: true, ownerAlertedVia: channel, note: "The owner replies in this same chat, from this number." };
      }
      if (ctx.notifyOwner) await ctx.notifyOwner(`Don Tuco escalation (${ctx.waId}): ${input.reason}`);
      return { escalated: true };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}
