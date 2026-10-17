const assert = require("node:assert/strict");
const test = require("node:test");

const {
    bookingSchedule,
    buildRawMessage,
    createBookingConfirmation,
    sendBookingConfirmation
} = require("./booking-email");

const booking = {
    id: 42,
    fullName: "Alex Guest",
    email: "alex@example.com",
    bookingDate: "2026-10-18",
    bookingType: "daycation",
    accommodation: "Tuscan Villa",
    guests: 4,
    eventType: "Family Gathering",
    specialRequests: "Please prepare <b>extra towels</b>.\nThank you."
};

test("uses check-in times ten minutes before each scheduled start", () => {
    assert.deepEqual(bookingSchedule("daycation"), {
        label: "Daycation",
        checkIn: "8:00 AM",
        earlyAccess: "7:50 AM",
        checkOut: "6:00 PM"
    });
    assert.deepEqual(bookingSchedule("nightcation"), {
        label: "Nightcation",
        checkIn: "8:00 PM",
        earlyAccess: "7:50 PM",
        checkOut: "6:00 AM"
    });
    assert.deepEqual(bookingSchedule("22hours"), {
        label: "22 Hours stay",
        checkIn: "8:00 AM",
        earlyAccess: "7:50 AM",
        checkOut: "6:00 AM"
    });
});

test("builds an email with booking details, embedded logo, and escaped requests", () => {
    const email = createBookingConfirmation(booking);

    assert.match(email.subject, /confirmed \(#42\)/);
    assert.match(email.text, /Early entry: 7:50 AM/);
    assert.match(email.text, /Sunday, October 18, 2026/);
    assert.match(email.html, /src="cid:sereno-verde-logo"/);
    assert.match(email.html, /Please prepare &lt;b&gt;extra towels&lt;\/b&gt;\.<br>Thank you\./);
    assert.doesNotMatch(email.html, /<b>extra towels<\/b>/);
    assert.equal(email.attachments[0].cid, "sereno-verde-logo");
});

test("builds a Gmail API-compatible message with a related logo attachment", () => {
    const raw = buildRawMessage(booking, "Sereno Verde <bookings@example.com>");
    const mime = Buffer.from(raw, "base64url").toString("utf8");

    assert.match(mime, /From: Sereno Verde <bookings@example\.com>/);
    assert.match(mime, /To: alex@example\.com/);
    assert.match(mime, /Content-Type: multipart\/related;/);
    assert.match(mime, /Content-Type: multipart\/alternative;/);
    assert.match(mime, /Content-ID: <sereno-verde-logo>/);
    assert.match(mime, /Content-Type: image\/png;/);
});

test("refreshes Gmail OAuth and sends the message through HTTPS", async () => {
    const originalFetch = global.fetch;
    const envKeys = [
        "GMAIL_OAUTH_CLIENT_ID",
        "GMAIL_OAUTH_CLIENT_SECRET",
        "GMAIL_OAUTH_REFRESH_TOKEN",
        "GMAIL_FROM"
    ];
    const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    const requests = [];

    Object.assign(process.env, {
        GMAIL_OAUTH_CLIENT_ID: "test-client-id",
        GMAIL_OAUTH_CLIENT_SECRET: "test-client-secret",
        GMAIL_OAUTH_REFRESH_TOKEN: "test-refresh-token",
        GMAIL_FROM: "Sereno Verde <bookings@example.com>"
    });

    global.fetch = async (url, options) => {
        requests.push({ url, options });
        if (url === "https://oauth2.googleapis.com/token") {
            return new Response(JSON.stringify({
                access_token: "test-access-token",
                expires_in: 3600
            }), { status: 200 });
        }
        return new Response(JSON.stringify({ id: "message-123" }), { status: 200 });
    };

    try {
        const result = await sendBookingConfirmation(booking);
        assert.equal(result.id, "message-123");
        assert.equal(requests.length, 2);
        assert.equal(requests[0].url, "https://oauth2.googleapis.com/token");
        assert.equal(requests[1].url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
        assert.equal(requests[1].options.headers.Authorization, "Bearer test-access-token");
        assert.ok(JSON.parse(requests[1].options.body).raw);
    } finally {
        global.fetch = originalFetch;
        for (const key of envKeys) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }
});
