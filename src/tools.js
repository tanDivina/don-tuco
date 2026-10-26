// Don Tuco's booking tools. Availability logic ported from tour-desk-mac,
// backed by DynamoDB (or an in-memory store when running the local CLI).
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

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
      // TODO: also merge busy blocks from pack.icalUrl once the calendar URL is set.
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
      const conflict = (await listBookings(pack.operatorId, input.date)).some(
        (b) => b.time === input.time
      );
      if (conflict) return { booked: false, reason: "slot was just taken — re-check availability" };
      const booking = {
        id: `bk_${Date.now().toString(36)}`,
        operatorId: pack.operatorId,
        ...input,
        createdAt: new Date().toISOString(),
        channel: "whatsapp",
        waId: ctx.waId,
      };
      await saveBooking(booking);
      if (ctx.confirmEmail) await ctx.confirmEmail(booking);
      if (ctx.notifyOwner) await ctx.notifyOwner(`New booking: ${JSON.stringify(booking)}`);
      return { booked: true, booking };
    }
    case "send_location": {
      if (ctx.sendLocation) await ctx.sendLocation(pack.location);
      return { sent: true, note: "Location pin delivered. You can also describe the boat arrival." };
    }
    case "escalate": {
      if (ctx.notifyOwner) await ctx.notifyOwner(`Don Tuco escalation (${ctx.waId}): ${input.reason}`);
      return { escalated: true };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}
