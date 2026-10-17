const assert = require("node:assert/strict");
const test = require("node:test");

const {
    bookingSchedule,
    buildSendGridPayload,
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

test("builds a SendGrid payload with the embedded logo and branded sender", () => {
    const payload = buildSendGridPayload(booking, "Sereno Verde <bookings@example.com>");

    assert.deepEqual(payload.from, {
        name: "Sereno Verde",
        email: "bookings@example.com"
    });
    assert.deepEqual(payload.personalizations[0].to, [{ email: "alex@example.com" }]);
    assert.match(payload.content[1].value, /src="cid:sereno-verde-logo"/);
    assert.equal(payload.attachments[0].content_id, "sereno-verde-logo");
    assert.equal(payload.attachments[0].disposition, "inline");
    assert.ok(Buffer.from(payload.attachments[0].content, "base64").length > 0);
});

test("sends the confirmation through the SendGrid HTTPS API", async () => {
    const originalFetch = global.fetch;
    const envKeys = [
        "SENDGRID_API_KEY",
        "SENDGRID_FROM"
    ];
    const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    const requests = [];

    Object.assign(process.env, {
        SENDGRID_API_KEY: "test-sendgrid-api-key",
        SENDGRID_FROM: "Sereno Verde <bookings@example.com>"
    });

    global.fetch = async (url, options) => {
        requests.push({ url, options });
        return new Response(null, { status: 202 });
    };

    try {
        const result = await sendBookingConfirmation(booking);
        assert.equal(result.accepted, true);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].url, "https://api.sendgrid.com/v3/mail/send");
        assert.equal(requests[0].options.headers.Authorization, "Bearer test-sendgrid-api-key");
        assert.ok(JSON.parse(requests[0].options.body).attachments[0].content);
    } finally {
        global.fetch = originalFetch;
        for (const key of envKeys) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }
});
