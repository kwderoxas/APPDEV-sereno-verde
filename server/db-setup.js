require("dotenv").config();

const bcrypt = require("bcryptjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Set ${name} in .env before setting up MySQL.`);
    return value;
}

function validateIdentifier(value, name) {
    if (!/^[A-Za-z0-9_]+$/.test(value)) {
        throw new Error(`${name} must contain only letters, numbers, and underscores.`);
    }
    return `\`${value}\``;
}

function validateDatabaseUser(value) {
    if (!/^[A-Za-z0-9_$-]{1,32}$/.test(value)) {
        throw new Error("DB_USER must contain only letters, numbers, _, $, or - (maximum 32 characters).");
    }
    return `'${value}'`;
}

async function main() {
    const database = requiredEnv("DB_NAME");
    const databaseUser = requiredEnv("DB_USER");
    const databasePassword = requiredEnv("DB_PASSWORD");
    const rootUser = requiredEnv("DB_ROOT_USER");
    const rootPassword = requiredEnv("DB_ROOT_PASSWORD");
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
    if (databasePassword.length < 20) {
        throw new Error("DB_PASSWORD must be at least 20 characters.");
    }
    if (databasePassword.includes("replace-with") || adminPassword.includes("replace-with")) {
        throw new Error("Replace the example DB_PASSWORD and ADMIN_PASSWORD values in .env first.");
    }
    const quotedDatabaseUser = validateDatabaseUser(databaseUser);

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT || 3306),
        user: rootUser,
        password: rootPassword,
        multipleStatements: false
    });

    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${validateIdentifier(database, "DB_NAME")} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
        for (const host of ["localhost", "127.0.0.1"]) {
            const account = `${quotedDatabaseUser}@'${host}'`;
            await connection.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${connection.escape(databasePassword)}`);
            await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON ${validateIdentifier(database, "DB_NAME")}.* TO ${account}`);
        }

        await connection.query(`USE ${validateIdentifier(database, "DB_NAME")}`);
        const schema = await fs.readFile(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
        for (const statement of schema.split(";").map(part => part.trim()).filter(Boolean)) {
            await connection.query(statement);
        }

        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await connection.execute(
            "INSERT INTO admins (username, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE username = VALUES(username)",
            [adminUsername, passwordHash]
        );
        await connection.execute(
            "INSERT INTO admin_settings (setting_key, setting_value) VALUES ('theme_color', '#a9856d') ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)"
        );
        console.log(`Database ${database} and application user ${databaseUser} are ready.`);
        console.log(`Administrator ${adminUsername} is ready. Existing admin passwords are not overwritten.`);
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error("Database setup failed:", error.message);
    process.exitCode = 1;
});
