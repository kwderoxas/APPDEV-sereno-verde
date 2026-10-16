require("dotenv").config();

const bcrypt = require("bcryptjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Set ${name} before initializing PostgreSQL.`);
    return value;
}

async function main() {
    const connectionString = requiredEnv("DATABASE_URL");
    const adminUsername = requiredEnv("ADMIN_USERNAME").trim();
    const adminPassword = requiredEnv("ADMIN_PASSWORD");

    if (!/^[A-Za-z0-9_.@-]{3,80}$/.test(adminUsername)) {
        throw new Error("ADMIN_USERNAME must be 3–80 characters using letters, numbers, ., _, @, or -.");
    }
    if (adminPassword.length < 12) {
        throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
    }
    if (Buffer.byteLength(adminPassword, "utf8") > 72) {
        throw new Error("ADMIN_PASSWORD must be no more than 72 UTF-8 bytes.");
    }

    const client = new Client({
        connectionString,
        ssl: process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : undefined
    });

    try {
        await client.connect();
        const schema = await fs.readFile(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
        for (const statement of schema.split(";").map(part => part.trim()).filter(Boolean)) {
            await client.query(statement);
        }

        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await client.query(
            "INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING",
            [adminUsername, passwordHash]
        );
        await client.query(
            `INSERT INTO admin_settings (setting_key, setting_value) VALUES ('theme_color', '#a9856d')
             ON CONFLICT (setting_key) DO NOTHING`
        );
        console.log("PostgreSQL schema and initial administrator are ready.");
        console.log(`Administrator ${adminUsername} is ready. Existing admin passwords are not overwritten.`);
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error("PostgreSQL setup failed:", error.message);
    process.exitCode = 1;
});
