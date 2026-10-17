const nodemailer = require("nodemailer");
const path = require("node:path");

let transporter;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatBookingDate(date) {
    const value = new Date(`${date}T12:00:00Z`);
    return new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila"
    }).format(value);
}

function bookingSchedule(type) {
    if (type === "daycation") {
        return {
            label: "Daycation",
            checkIn: "8:00 AM",
            earlyAccess: "7:50 AM",
            checkOut: "6:00 PM"
        };
    }
    if (type === "nightcation") {
        return {
            label: "Nightcation",
            checkIn: "8:00 PM",
            earlyAccess: "7:50 PM",
            checkOut: "6:00 AM"
        };
    }
    return {
        label: "22 Hours stay",
        checkIn: "8:00 AM",
        earlyAccess: "7:50 AM",
        checkOut: "6:00 AM"
    };
}

function createBookingConfirmation(booking) {
    const schedule = bookingSchedule(booking.bookingType);
    const date = formatBookingDate(booking.bookingDate);
    const name = escapeHtml(booking.fullName);
    const accommodation = escapeHtml(booking.accommodation);
    const eventType = escapeHtml(booking.eventType || "—");
    const guestCount = escapeHtml(booking.guests);
    const reference = escapeHtml(booking.id);
    const requests = booking.specialRequests
        ? escapeHtml(booking.specialRequests).replace(/\r?\n/g, "<br>")
        : "None";

    const rows = [
        ["Booking reference", `#${reference}`],
        ["Guest", name],
        ["Date", escapeHtml(date)],
        ["Stay", escapeHtml(schedule.label)],
        ["Accommodation", accommodation],
        ["Guests", guestCount],
        ["Event", eventType]
    ];
    const details = rows.map(([label, value]) => `
        <tr>
            <td style="padding:11px 0;color:#756b61;font-size:13px;border-bottom:1px solid #eee8e1">${label}</td>
            <td style="padding:11px 0;color:#302a25;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #eee8e1">${value}</td>
        </tr>
    `).join("");

    const textDetails = [
        `Booking reference: #${booking.id}`,
        `Guest: ${booking.fullName}`,
        `Date: ${date}`,
        `Stay: ${schedule.label}`,
        `Accommodation: ${booking.accommodation}`,
        `Guests: ${booking.guests}`,
        `Event: ${booking.eventType || "—"}`,
        `Special requests: ${booking.specialRequests || "None"}`
    ].join("\n");

    return {
        subject: `Your Sereno Verde booking is confirmed (#${booking.id})`,
        text: [
            `Hello ${booking.fullName},`,
            "",
            "Your booking at Sereno Verde is confirmed. We look forward to welcoming you!",
            "",
            textDetails,
            "",
            `Scheduled check-in: ${schedule.checkIn}`,
            `Early entry: ${schedule.earlyAccess} (10 minutes before check-in)`,
            `Check-out: ${schedule.checkOut}`,
            "",
            "Please show this email when you arrive."
        ].join("\n"),
        html: `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#302a25">
  <div style="display:none;max-height:0;overflow:hidden">Your ${escapeHtml(schedule.label)} at Sereno Verde is confirmed.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ec;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden">
        <tr><td align="center" style="padding:30px 24px 22px;background:#f8f5ef">
          <img src="cid:sereno-verde-logo" width="82" height="82" alt="Sereno Verde" style="display:block;width:82px;height:82px;object-fit:contain;margin:0 auto 12px">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;letter-spacing:.3px;color:#5c4939">Sereno Verde</div>
          <div style="margin-top:6px;color:#938273;font-size:11px;letter-spacing:2px;text-transform:uppercase">A stay to remember</div>
        </td></tr>
        <tr><td style="padding:30px 34px 12px">
          <div style="color:#789273;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">Booking confirmed</div>
          <h1 style="margin:10px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:400;color:#342e29">We look forward to welcoming you, ${name}!</h1>
          <p style="margin:0;color:#766e66;font-size:14px;line-height:1.7">Your reservation is confirmed. Keep this email handy and share your booking reference when you arrive.</p>
        </td></tr>
        <tr><td style="padding:18px 34px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${details}
            <tr><td style="padding:11px 0;color:#756b61;font-size:13px;border-bottom:1px solid #eee8e1">Special requests</td>
              <td style="padding:11px 0;color:#302a25;font-size:13px;text-align:right;border-bottom:1px solid #eee8e1">${requests}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 34px 28px">
          <div style="padding:20px 22px;background:#f3f6ef;border:1px solid #e3eadc;border-radius:10px">
            <div style="margin-bottom:12px;color:#546c4e;font-size:13px;font-weight:700">Your arrival times</div>
            <div style="margin:7px 0;color:#574f48;font-size:13px;line-height:1.6"><strong>Scheduled check-in:</strong> ${escapeHtml(schedule.checkIn)}</div>
            <div style="margin:7px 0;color:#574f48;font-size:13px;line-height:1.6"><strong>Early entry:</strong> ${escapeHtml(schedule.earlyAccess)} <span style="color:#81786f">(10 minutes before check-in)</span></div>
            <div style="margin:7px 0;color:#574f48;font-size:13px;line-height:1.6"><strong>Check-out:</strong> ${escapeHtml(schedule.checkOut)}</div>
          </div>
        </td></tr>
        <tr><td align="center" style="padding:20px 28px;background:#f8f5ef;color:#8b8076;font-size:11px;line-height:1.7">
          Thank you for choosing Sereno Verde.<br>Please show this confirmation when you arrive.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        attachments: [{
            filename: "sereno-verde-logo.png",
            path: path.join(__dirname, "..", "images", "logoSV.PNG"),
            cid: "sereno-verde-logo"
        }]
    };
}

function getTransporter() {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
        throw new Error(
            "Booking confirmation email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM."
        );
    }

    const port = Number(SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("SMTP_PORT must be a valid TCP port.");
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port,
            secure: SMTP_SECURE === "true",
            auth: { user: SMTP_USER, pass: SMTP_PASS }
        });
    }
    return { transporter, from: SMTP_FROM };
}

async function sendBookingConfirmation(booking) {
    const { transporter: mailTransporter, from } = getTransporter();
    return mailTransporter.sendMail({
        from,
        to: booking.email,
        ...createBookingConfirmation(booking)
    });
}

module.exports = { bookingSchedule, createBookingConfirmation, sendBookingConfirmation };
