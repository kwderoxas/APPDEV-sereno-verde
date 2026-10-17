require("dotenv").config();

const path = require("node:path");
const bcrypt = require("bcryptjs");
const express = require("express");
const session = require("express-session");
const rateLimit = require("express-rate-limit").rateLimit;
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
app.set("trust proxy", 1);

for (const name of ["DATABASE_URL", "SESSION_SECRET"]) {
    if (!process.env[name]) {
        console.error(`Missing ${name}. Set it in the deployment environment or local .env file.`);
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
    console.error("Replace the example SESSION_SECRET value with a private value.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined
});

class PostgreSQLSessionStore extends session.Store {
    get(sessionId, callback) {
        pool.query("SELECT expires, data FROM admin_sessions WHERE session_id = $1", [sessionId])
            .then(result => {
                const record = result.rows[0];
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
        pool.query(
            `INSERT INTO admin_sessions (session_id, expires, data) VALUES ($1, $2, $3)
             ON CONFLICT (session_id) DO UPDATE
             SET expires = EXCLUDED.expires, data = EXCLUDED.data`,
            [sessionId, expiration, JSON.stringify(sessionData)]
        ).then(() => callback()).catch(callback);
    }

    destroy(sessionId, callback = () => {}) {
        pool.query("DELETE FROM admin_sessions WHERE session_id = $1", [sessionId])
            .then(() => callback()).catch(callback);
    }

    touch(sessionId, sessionData, callback = () => {}) {
        const expiration = sessionData.cookie?.expires
            ? new Date(sessionData.cookie.expires).getTime()
            : Date.now() + 8 * 60 * 60 * 1000;
        pool.query("UPDATE admin_sessions SET expires = $1 WHERE session_id = $2", [expiration, sessionId])
            .then(() => callback()).catch(callback);
    }
}

const sessionStore = new PostgreSQLSessionStore();
const sessionCleanup = setInterval(() => {
    pool.query("DELETE FROM admin_sessions WHERE expires <= $1", [Date.now()])
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
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
        }
    }
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

async function lockBookingSlot(connection, date, accommodation) {
    await connection.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`${date}:${accommodation}`]
    );
}

async function hasBookingConflict(connection, date, accommodation, bookingType, excludeId) {
    const result = await connection.query(
        `SELECT booking_type, status FROM bookings
         WHERE booking_date = $1 AND accommodation = $2
            AND status NOT IN ('cancelled', 'rejected')
            AND ($3::bigint IS NULL OR id <> $3)
         FOR UPDATE`,
        [date, accommodation, excludeId || null]
    );

    return result.rows.some(booking => {
        const existingType = String(booking.booking_type).toLowerCase();
        if (booking.status === "blocked") return true;
        if (bookingType === "22hours" || existingType === "22hours") return true;
        if (!["daycation", "nightcation"].includes(existingType)) return true;
        return bookingType === existingType;
    });
}

app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
    const username = requiredText(req.body.username, "Username", 80);
    const password = requiredPassword(req.body.password, "Password");
    const admins = await pool.query("SELECT id, username, password_hash FROM admins WHERE username = $1 LIMIT 1", [username]);
    const admin = admins.rows[0];

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

app.get("/api/health", asyncRoute(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
}));

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

    const admins = await pool.query("SELECT id, password_hash FROM admins WHERE id = $1 LIMIT 1", [req.session.admin.id]);
    const admin = admins.rows[0];
    if (!admin || !(await bcrypt.compare(currentPassword, admin.password_hash))) {
        return res.status(403).json({ error: "Current password is incorrect." });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        await pool.query(
            "UPDATE admins SET username = $1, password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
            [username, passwordHash, admin.id]
        );
    } catch (error) {
        if (error.code === "23505") return res.status(409).json({ error: "That username is already in use." });
        throw error;
    }

    req.session.admin.username = username;
    res.json({ username });
}));

app.get("/api/settings", requireAdmin, asyncRoute(async (req, res) => {
    const result = await pool.query("SELECT setting_value FROM admin_settings WHERE setting_key = 'theme_color'");
    res.json({ themeColor: result.rows[0]?.setting_value || "#a9856d" });
}));

app.put("/api/settings", requireAdmin, asyncRoute(async (req, res) => {
    const themeColor = requiredText(req.body.themeColor, "Theme color", 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
        return res.status(400).json({ error: "Theme color must be a six-digit hex color." });
    }
    await pool.query(
        `INSERT INTO admin_settings (setting_key, setting_value) VALUES ('theme_color', $1)
         ON CONFLICT (setting_key) DO UPDATE
         SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [themeColor]
    );
    res.json({ themeColor });
}));

app.get("/api/bookings", requireAdmin, asyncRoute(async (req, res) => {
    const result = await pool.query(`
        SELECT b.id, g.full_name AS "fullName", g.fb_name AS "fbName", g.email, g.phone,
            g.region, g.province, g.city,
            to_char(b.booking_date, 'YYYY-MM-DD') AS booking_date, b.accommodation,
            b.booking_type, b.event_type AS "eventType", b.guest_count AS guests,
            b.special_requests AS "specialRequests", b.status,
            b.created_at AS "createdAt"
        FROM bookings b
        JOIN guests g ON g.id = b.guest_id
        ORDER BY b.created_at DESC
    `);
    res.json({ bookings: result.rows });
}));

app.get("/api/availability", asyncRoute(async (req, res) => {
    const result = await pool.query(
        "SELECT to_char(booking_date, 'YYYY-MM-DD') AS booking_date, accommodation, booking_type, status FROM bookings WHERE status NOT IN ('cancelled', 'rejected')"
    );
    res.json({ bookings: result.rows });
}));

app.post("/api/bookings", submissionLimiter, asyncRoute(async (req, res) => {
    const booking = validateBooking(req.body);
    const connection = await pool.connect();

    try {
        await connection.query("BEGIN");
        await lockBookingSlot(connection, booking.bookingDate, booking.accommodation);
        if (await hasBookingConflict(
            connection,
            booking.bookingDate,
            booking.accommodation,
            booking.bookingType
        )) {
            await connection.query("ROLLBACK");
            return res.status(409).json({ error: "This date and booking type are no longer available for that accommodation." });
        }

        const guest = await connection.query(
            `INSERT INTO guests (full_name, fb_name, email, phone, region, province, city)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (email) DO UPDATE SET
                full_name = EXCLUDED.full_name, fb_name = EXCLUDED.fb_name,
                phone = EXCLUDED.phone, region = EXCLUDED.region, province = EXCLUDED.province,
                city = EXCLUDED.city, updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [booking.fullName, booking.fbName, booking.email, booking.phone, booking.region, booking.province, booking.city]
        );
        const result = await connection.query(
            `INSERT INTO bookings
             (guest_id, booking_date, accommodation, booking_type, event_type, guest_count, special_requests)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [guest.rows[0].id, booking.bookingDate, booking.accommodation, booking.bookingType,
                booking.eventType, booking.guests, booking.specialRequests || null]
        );
        await connection.query("COMMIT");
        res.status(201).json({ id: result.rows[0].id, status: "pending" });
    } catch (error) {
        await connection.query("ROLLBACK");
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
    const connection = await pool.connect();

    try {
        await connection.query("BEGIN");
        if (!["cancelled", "rejected"].includes(status)) {
            await lockBookingSlot(connection, date, accommodation);
            if (await hasBookingConflict(connection, date, accommodation, bookingType, id)) {
                await connection.query("ROLLBACK");
                return res.status(409).json({ error: "That date and booking type are already booked for the selected accommodation." });
            }
        }

        const result = await connection.query(
            "UPDATE bookings SET booking_date = $1, accommodation = $2, booking_type = $3, status = $4 WHERE id = $5",
            [date, accommodation, bookingType, status, id]
        );
        if (!result.rowCount) {
            await connection.query("ROLLBACK");
            return res.status(404).json({ error: "Booking not found." });
        }

        await connection.query("COMMIT");
        res.json({ updated: true });
    } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
    } finally {
        connection.release();
    }
}));

app.get("/api/guests", requireAdmin, asyncRoute(async (req, res) => {
    const result = await pool.query(`
        SELECT g.id, g.full_name AS "fullName", g.fb_name AS "fbName", g.email, g.phone,
            g.region, g.province, g.city, COUNT(b.id) AS "bookingCount",
            to_char(MAX(b.booking_date), 'YYYY-MM-DD') AS "latestBookingDate"
        FROM guests g
        LEFT JOIN bookings b ON b.guest_id = g.id
        GROUP BY g.id
        ORDER BY g.full_name
    `);
    res.json({ guests: result.rows });
}));

app.get("/api/feedback", asyncRoute(async (req, res) => {
    if (req.query.villa === undefined && !req.session.admin) {
        return res.status(401).json({ error: "Administrator login required to view all feedback." });
    }
    const parameters = [];
    let where = "";
    if (req.query.villa !== undefined) {
        where = "WHERE f.villa = $1";
        parameters.push(validVilla(req.query.villa));
    }
    const result = await pool.query(
        `SELECT f.id, f.guest_name AS name, f.villa, f.rating, f.comment AS feedback, f.created_at AS "createdAt"
         FROM feedback f ${where} ORDER BY f.created_at DESC`,
        parameters
    );
    res.json({ reviews: result.rows });
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
        const guests = await pool.query("SELECT id FROM guests WHERE email = $1 LIMIT 1", [email]);
        guestId = guests.rows[0]?.id || null;
    }
    await pool.query(
        "INSERT INTO feedback (guest_id, guest_name, villa, rating, comment) VALUES ($1, $2, $3, $4, $5)",
        [guestId, name, villa, rating, feedback]
    );
    res.status(201).json({ saved: true });
}));

app.get("/admin.html", (req, res) => {
    if (!req.session.admin) return res.redirect("/login.html");
    res.sendFile(path.join(__dirname, "admin.html"));
});

const blockedStaticPaths = new Set([
    "/.gitignore",
    "/README.md",
    "/package.json",
    "/package-lock.json",
    "/server.js",
    "/server",
    "/database",
    "/node_modules"
]);

app.use((req, res, next) => {
    const pathname = decodeURIComponent(req.path).replace(/\\/g, "/").toLowerCase();
    if ([...blockedStaticPaths].some(blocked =>
        pathname === blocked || pathname.startsWith(blocked + "/")
    )) {
        return res.sendStatus(404);
    }
    next();
});

app.use(express.static(__dirname, {
    dotfiles: "deny",
    index: "index.html",
    fallthrough: true
}));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Error handler
app.use((error, req, res, next) => {
    console.error("Request failed:", error);
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? "The server could not complete the request." : error.message });
});

// Start the server
async function start() {
    await pool.query("SELECT 1");
    app.listen(port, "0.0.0.0", () => {
        console.log(`Sereno Verde is live and listening on port ${port}`);
    });
}

start().catch(error => {
    console.error("Could not connect to PostgreSQL. Check DATABASE_URL in the deployment environment or local .env file.");
    console.error(error.message);
    process.exit(1);
});
