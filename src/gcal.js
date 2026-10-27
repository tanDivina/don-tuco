// Google Calendar as the operator's visible ledger: busy events block slots, and
// every Don Tuco booking becomes an event. Service-account auth with node:crypto,
// no extra dependencies. Off unless GOOGLE_CALENDAR_ID and GOOGLE_SA_KEY are set.
import { createSign } from "node:crypto";

const CAL_ID = process.env.GOOGLE_CALENDAR_ID || "";
const API = "https://www.googleapis.com/calendar/v3";
let key = null;
try {
  key = process.env.GOOGLE_SA_KEY ? JSON.parse(process.env.GOOGLE_SA_KEY) : null;
} catch {
  console.error("GOOGLE_SA_KEY is not valid JSON; calendar sync off");
}

export const calendarEnabled = () => Boolean(CAL_ID && key);

let token = null; // { value, exp }

async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}: ${await res.text()}`);
  const data = await res.json();
  token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function api(method, path, body) {
  const res = await fetch(`${API}/calendars/${encodeURIComponent(CAL_ID)}${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`google calendar ${method} ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// Panama has no DST, but derive the offset from the pack's zone anyway.
function offsetFor(timeZone, date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName").value; // "GMT-05:00"
  return name === "GMT" ? "+00:00" : name.slice(3);
}

const at = (pack, date, time) => new Date(`${date}T${time}:00${offsetFor(pack.timezone, date)}`);

/**
 * Busy intervals on a date from events the operator added themselves (Don Tuco's own
 * booking events are skipped: the bookings table already covers those).
 */
export async function busyOn(pack, date) {
  const dayStart = at(pack, date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const q = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: "true",
    maxResults: "100",
  });
  const data = await api("GET", `/events?${q}`);
  return (data.items || [])
    .filter((e) => e.status !== "cancelled" && e.transparency !== "transparent")
    .filter((e) => !e.extendedProperties?.private?.donTucoBookingId)
    .map((e) => ({
      title: e.summary || "busy",
      // all-day events block the whole day
      start: e.start.dateTime ? new Date(e.start.dateTime) : dayStart,
      end: e.end.dateTime ? new Date(e.end.dateTime) : dayEnd,
    }));
}

/** Slots on the date whose tour window overlaps an operator calendar event. */
export async function blockedSlots(pack, date, slots, durationMinutes) {
  const busy = await busyOn(pack, date);
  return slots.filter((slot) => {
    const s = at(pack, date, slot);
    const e = new Date(s.getTime() + durationMinutes * 60_000);
    return busy.some((b) => b.start < e && b.end > s);
  });
}

/** Create or update the calendar event for a booking. Returns the event id. */
export async function upsertBookingEvent(pack, booking) {
  const tour = pack.tours.find((t) => t.id === booking.tourId);
  const start = at(pack, booking.date, booking.time);
  const end = new Date(start.getTime() + (tour?.durationMinutes || 120) * 60_000);
  const event = {
    summary: `${tour?.name.en || booking.tourId}: ${booking.guestName || "guest"} x${booking.people}`,
    description: [
      `Booked by Don Tuco on WhatsApp`,
      `Guests: ${booking.people}`,
      `Total: $${tour ? tour.pricePerPerson * booking.people : "?"} ${pack.currency} (cash at the farm)`,
      booking.guestEmail ? `Email: ${booking.guestEmail}` : null,
      booking.notes ? `Notes: ${booking.notes}` : null,
      booking.waId ? `Chat: https://wa.me/${booking.waId.replace("+", "")}` : null,
      `Booking id: ${booking.id}`,
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: start.toISOString(), timeZone: pack.timezone },
    end: { dateTime: end.toISOString(), timeZone: pack.timezone },
    extendedProperties: { private: { donTucoBookingId: booking.id } },
  };
  const saved = booking.calendarEventId
    ? await api("PATCH", `/events/${encodeURIComponent(booking.calendarEventId)}`, event)
    : await api("POST", `/events`, event);
  return saved.id;
}

/** Remove a booking's calendar event (cancellations). */
export async function deleteBookingEvent(eventId) {
  await api("DELETE", `/events/${encodeURIComponent(eventId)}`);
}
