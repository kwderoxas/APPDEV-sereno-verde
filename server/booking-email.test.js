const assert = require("node:assert/strict");
const test = require("node:test");

const { bookingSchedule, createBookingConfirmation } = require("./booking-email");

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
