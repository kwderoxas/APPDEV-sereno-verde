require("dotenv").config();

const path = require("node:path");
const bcrypt = require("bcryptjs");
const express = require("express");
const session = require("express-session");
const rateLimit = require("express-rate-limit").rateLimit;
const helmet = require("helmet");
const mysql = require("mysql2/promise");

const app = express();
const port = Number(process.env.PORT || 3000);
const databaseConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "sereno_verde"
};

for (const name of ["DB_USER", "DB_PASSWORD", "SESSION_SECRET"]) {
    if (!process.env[name]) {
        console.error(`Missing ${name}. Copy .env.example to .env and set the local configuration.`);
        process.exit(1);
    }
}

function requiredPassword(value, name) {
    if (typeof value !== "string" || !value.length) {
        throw Object.assign(new Error(`${name} is required.`), { status: 400 });
    }
    if (Buffer.byteLength(value, "utf8") > 72) {
        throw Object.assign(new Error(`${name} must be no more than 72 UTF-8 bytes.`), { status: 400 });
    }
    return value;
}

if (process.env.SESSION_SECRET.length < 32) {
    console.error("SESSION_SECRET must contain at least 32 characters.");
    process.exit(1);
}
if (process.env.SESSION_SECRET.includes("replace-with")) {
    console.error("Replace the example SESSION_SECRET value in .env.");
    process.exit(1);
}

const pool = mysql.createPool({
    ...databaseConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4"
});

class MySQLSessionStore extends session.Store {
    get(sessionId, callback) {
        pool.execute("SELECT expires, data FROM admin_sessions WHERE session_id = ?", [sessionId])
            .then(([rows]) => {
                const record = rows[0];
                if (!record) return callback(null, null);
                if (Number(record.expires) <= Date.now()) {
                    return this.destroy(sessionId, error => callback(error, null));
                }
                callback(null, JSON.parse(record.data));
            })
            .catch(callback);
    }

    set(sessionId, sessionData, callback = () => {}) {
        const expiration = sessionData.cookie?.expires
            ? new Date(sessionData.cookie.expires).getTime()
            : Date.now() + 8 * 60 * 60 * 1000;
        pool.execute(
            `INSERT INTO admin_sessions (session_id, expires, data) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
            [sessionId, expiration, JSON.stringify(sessionData)]
        ).then(() => callback()).catch(callback);
    }

    destroy(sessionId, callback = () => {}) {
        pool.execute("DELETE FROM admin_sessions WHERE session_id = ?", [sessionId])
            .then(() => callback()).catch(callback);
    }

    touch(sessionId, sessionData, callback = () => {}) {
        const expiration = sessionData.cookie?.expires
            ? new Date(sessionData.cookie.expires).getTime()
            : Date.now() + 8 * 60 * 60 * 1000;
        pool.execute("UPDATE admin_sessions SET expires = ? WHERE session_id = ?", [expiration, sessionId])
            .then(() => callback()).catch(callback);
    }
}

const sessionStore = new MySQLSessionStore();
const sessionCleanup = setInterval(() => {
    pool.execute("DELETE FROM admin_sessions WHERE expires <= ?", [Date.now()])
        .catch(error => console.error("Could not remove expired admin sessions:", error.message));
}, 30 * 60 * 1000);
sessionCleanup.unref();

app.disable("x-powered-by");
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.onrender.com"], // ◄ Added to allow Render traffic
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
        }
    },
    crossOriginEmbedderPolicy: false // ◄ Added to make sure images load smoothly
}));
app.use(express.json({ limit: "20kb" }));
app.use(session({
    name: "sereno.admin",
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60 * 1000
    }
}));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again later." }
});
const submissionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many submissions. Please try again later." }
});

function requireAdmin(req, res, next) {
    if (!req.session.admin) return res.status(401).json({ error: "Administrator login required." });
    next();
}

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requiredText(value, name, maximum, optional = false) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized && optional) return "";
    if (!normalized || normalized.length > maximum) {
        const issue = !normalized ? "is required" : `must be no longer than ${maximum} characters`;
        throw Object.assign(new Error(`${name} ${issue}.`), { status: 400 });
    }
    return normalized;
}

function validVilla(value) {
    if (value !== "tuscan" && value !== "spanish") {
        throw Object.assign(new Error("Villa must be tuscan or spanish."), { status: 400 });
    }
    return value;
}

function validBookingDate(value, allowPast = false) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw Object.assign(new Error("Choose a valid booking date."), { status: 400 });
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw Object.assign(new Error("Choose a valid booking date."), { status: 400 });
    }
    if (!allowPast && value < new Date().toISOString().slice(0, 10)) {
        throw Object.assign(new Error("Past booking dates are not allowed."), { status: 400 });
    }
    return value;
}

function validEmail(value, required = true) {
    const email = requiredText(value, "Email", 254, !required).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw Object.assign(new Error("Enter a valid email address."), { status: 400 });
    }
    return email;
}

function validateBooking(body) {
    const guests = Number(body.guests);
    const bookingType = requiredText(body.bookingType, "Booking type", 24);
    if (!["daycation", "nightcation", "22hours"].includes(bookingType)) {
        throw Object.assign(new Error("Choose a valid booking type."), { status: 400 });
    }
    if (!Number.isInteger(guests) || guests < 1 || guests > 100) {
        throw Object.assign(new Error("Guest count must be between 1 and 100."), { status: 400 });
    }
    const accommodation = requiredText(body.accommodation, "Accommodation", 80);
    if (!["Tuscan Villa", "Spanish Villa", "Other"].includes(accommodation)) {
        throw Object.assign(new Error("Choose a valid accommodation."), { status: 400 });
    }

    return {
        fullName: requiredText(body.fullName, "Full name", 120),
        fbName: requiredText(body.fbName, "Facebook name", 120),
        email: validEmail(body.email),
        phone: requiredText(body.phone, "Phone number", 40),
        region: requiredText(body.region, "Region", 120, true),
        province: requiredText(body.province, "Province", 120, true),
        city: requiredText(body.city, "City or municipality", 120, true),
        bookingDate: validBookingDate(body.bookingDate),
        accommodation,
        bookingType,
        eventType: requiredText(body.eventType, "Event type", 80),
        guests,
        specialRequests: requiredText(body.specialRequests, "Special requests", 2000, true)
    };
}

app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
    const username = requiredText(req.body.username, "Username", 80);
    const password = requiredPassword(req.body.password, "Password");
    const [admins] = await pool.execute("SELECT id, username, password_hash FROM admins WHERE username = ? LIMIT 1", [username]);
    const admin = admins[0];

    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
        return res.status(401).json({ error: "Incorrect username or password." });
    }

    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.admin = { id: admin.id, username: admin.username };
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.json({ username: admin.username });
}));

app.get("/api/auth/session", (req, res) => {
    if (!req.session.admin) return res.status(401).json({ error: "Administrator login required." });
    res.json({ username: req.session.admin.username });
});

app.post("/api/auth/logout", requireAdmin, asyncRoute(async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie("sereno.admin", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
    res.status(204).end();
}));

app.patch("/api/auth/credentials", requireAdmin, asyncRoute(async (req, res) => {
    const currentPassword = requiredPassword(req.body.currentPassword, "Current password");
    const username = requiredText(req.body.username, "Username", 80);
    const password = requiredPassword(req.body.newPassword, "New password");
    if (!/^[A-Za-z0-9_.@-]{3,80}$/.test(username)) {
        return res.status(400).json({ error: "Username must be 3–80 characters using letters, numbers, ., _, @, or -." });
    }
    if (password.length < 12) return res.status(400).json({ error: "New password must contain at least 12 characters." });

    const [admins] = await pool.execute("SELECT id, password_hash FROM admins WHERE id = ? LIMIT 1", [req.session.admin.id]);
    const admin = admins[0];
    if (!admin || !(await bcrypt.compare(currentPassword, admin.password_hash))) {
        return res.status(403).json({ error: "Current password is incorrect." });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        await pool.execute("UPDATE admins SET username = ?, password_hash = ? WHERE id = ?", [username, passwordHash, admin.id]);
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That username is already in use." });
        throw error;
    }

    req.session.admin.username = username;
    res.json({ username });
}));

app.get("/api/settings", requireAdmin, asyncRoute(async (req, res) => {
    const [rows] = await pool.execute("SELECT setting_value FROM admin_settings WHERE setting_key = 'theme_color'");
    res.json({ themeColor: rows[0]?.setting_value || "#a9856d" });
}));

app.put("/api/settings", requireAdmin, asyncRoute(async (req, res) => {
    const themeColor = requiredText(req.body.themeColor, "Theme color", 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
        return res.status(400).json({ error: "Theme color must be a six-digit hex color." });
    }
    await pool.execute(
        "INSERT INTO admin_settings (setting_key, setting_value) VALUES ('theme_color', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
        [themeColor]
    );
    res.json({ themeColor });
}));

app.get("/api/bookings", requireAdmin, asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(`
        SELECT b.id, g.full_name AS fullName, g.fb_name AS fbName, g.email, g.phone,
            g.region, g.province, g.city,
            DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date, b.accommodation,
            b.booking_type, b.event_type AS eventType, b.guest_count AS guests,
            b.special_requests AS specialRequests, b.status,
            b.created_at AS createdAt
        FROM bookings b
        JOIN guests g ON g.id = b.guest_id
        ORDER BY b.created_at DESC
    `);
    res.json({ bookings: rows });
}));

app.get("/api/availability", asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(
        "SELECT DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, accommodation, status FROM bookings WHERE status NOT IN ('cancelled', 'rejected')"
    );
    res.json({ bookings: rows });
}));

app.post("/api/bookings", submissionLimiter, asyncRoute(async (req, res) => {
    const booking = validateBooking(req.body);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const [conflicts] = await connection.execute(
            "SELECT id FROM bookings WHERE booking_date = ? AND accommodation = ? AND status NOT IN ('cancelled', 'rejected') FOR UPDATE",
            [booking.bookingDate, booking.accommodation]
        );
        if (conflicts.length) {
            await connection.rollback();
            return res.status(409).json({ error: "This date is no longer available for that accommodation." });
        }

        await connection.execute(
            `INSERT INTO guests (full_name, fb_name, email, phone, region, province, city)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), fb_name = VALUES(fb_name),
                phone = VALUES(phone), region = VALUES(region), province = VALUES(province), city = VALUES(city)`,
            [booking.fullName, booking.fbName, booking.email, booking.phone, booking.region, booking.province, booking.city]
        );
        const [guestRows] = await connection.execute("SELECT id FROM guests WHERE email = ? FOR UPDATE", [booking.email]);
        const [result] = await connection.execute(
            `INSERT INTO bookings
             (guest_id, booking_date, accommodation, booking_type, event_type, guest_count, special_requests)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [guestRows[0].id, booking.bookingDate, booking.accommodation, booking.bookingType,
                booking.eventType, booking.guests, booking.specialRequests || null]
        );
        await connection.commit();
        res.status(201).json({ id: result.insertId, status: "pending" });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}));

app.put("/api/bookings/:id", requireAdmin, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid booking ID." });
    const date = validBookingDate(req.body.booking_date, true);
    const accommodation = requiredText(req.body.accommodation, "Accommodation", 80);
    const bookingType = requiredText(req.body.booking_type, "Booking type", 24);
    const status = requiredText(req.body.status, "Status", 20);
    if (!["Tuscan Villa", "Spanish Villa", "Other"].includes(accommodation) ||
        !["daycation", "nightcation", "22hours"].includes(bookingType) ||
        !["pending", "confirmed", "cancelled", "rejected", "blocked"].includes(status)) {
        return res.status(400).json({ error: "Booking update contains an invalid value." });
    }
    if (!["cancelled", "rejected"].includes(status)) {
        const [conflicts] = await pool.execute(
            `SELECT id FROM bookings
             WHERE booking_date = ? AND accommodation = ? AND status NOT IN ('cancelled', 'rejected') AND id <> ?
             LIMIT 1`,
            [date, accommodation, id]
        );
        if (conflicts.length) return res.status(409).json({ error: "That date is already booked for the selected accommodation." });
    }
    const [result] = await pool.execute(
        "UPDATE bookings SET booking_date = ?, accommodation = ?, booking_type = ?, status = ? WHERE id = ?",
        [date, accommodation, bookingType, status, id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "Booking not found." });
    res.json({ updated: true });
}));

app.get("/api/guests", requireAdmin, asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(`
        SELECT g.id, g.full_name AS fullName, g.fb_name AS fbName, g.email, g.phone,
            g.region, g.province, g.city, COUNT(b.id) AS bookingCount,
            DATE_FORMAT(MAX(b.booking_date), '%Y-%m-%d') AS latestBookingDate
        FROM guests g
        LEFT JOIN bookings b ON b.guest_id = g.id
        GROUP BY g.id
        ORDER BY g.full_name
    `);
    res.json({ guests: rows });
}));

app.get("/api/feedback", asyncRoute(async (req, res) => {
    if (req.query.villa === undefined && !req.session.admin) {
        return res.status(401).json({ error: "Administrator login required to view all feedback." });
    }
    const parameters = [];
    let where = "";
    if (req.query.villa !== undefined) {
        where = "WHERE f.villa = ?";
        parameters.push(validVilla(req.query.villa));
    }
    const [rows] = await pool.execute(
        `SELECT f.id, f.guest_name AS name, f.villa, f.rating, f.comment AS feedback, f.created_at AS createdAt
         FROM feedback f ${where} ORDER BY f.created_at DESC`,
        parameters
    );
    res.json({ reviews: rows });
}));

app.post("/api/feedback", submissionLimiter, asyncRoute(async (req, res) => {
    const name = requiredText(req.body.name, "Name", 120);
    const villa = validVilla(req.body.villa);
    const rating = Number(req.body.rating);
    const feedback = requiredText(req.body.feedback, "Feedback", 1000);
    const email = validEmail(req.body.email, false);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5." });
    }
    let guestId = null;
    if (email) {
        const [guests] = await pool.execute("SELECT id FROM guests WHERE email = ? LIMIT 1", [email]);
        guestId = guests[0]?.id || null;
    }
    await pool.execute(
        "INSERT INTO feedback (guest_id, guest_name, villa, rating, comment) VALUES (?, ?, ?, ?, ?)",
        [guestId, name, villa, rating, feedback]
    );
    res.status(201).json({ saved: true });
}));

app.get("/admin.html", (req, res) => {
    if (!req.session.admin) return res.redirect("/login.html");
    res.sendFile(path.join(__dirname, "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

// 2. Add a fallback route so refreshing your web pages doesn't give a 404 error
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 3. Error handler
app.use((error, req, res, next) => {
    console.error("Request failed:", error);
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? "The server could not complete the request." : error.message });
});

// 4. Start the server (Removed "127.0.0.1" so Render can open it to the public internet)
async function start() {
    await pool.query("SELECT 1");
    app.listen(port, () => {
        console.log(`Sereno Verde is live and listening on port ${port}`);
    });
}

start().catch(error => {
    console.error("Could not connect to MySQL. Check DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in .env.");
    console.error(error.message);
    process.exit(1);
});
