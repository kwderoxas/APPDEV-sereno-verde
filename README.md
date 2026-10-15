# Sereno Verde

## Local application and MySQL setup

The website and admin dashboard run through the local Express server. Booking
submissions, guest records, reviews, administrator accounts, theme settings,
and admin sessions are stored in MySQL.

1. MySQL Server 8.4 and Node.js are installed on this computer.
2. In PowerShell, copy `.env.example` to `.env` with `Copy-Item .env.example .env`.
3. Open `.env` locally and set `DB_ROOT_PASSWORD` to the local MySQL root
   password. Set unique values
   for `DB_PASSWORD`, `ADMIN_PASSWORD`, and `SESSION_SECRET`. Use at least 20
   characters for `DB_PASSWORD`, 12 for `ADMIN_PASSWORD`, and 32 for
   `SESSION_SECRET`. Generate a session secret with
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   Keep `.env` private; it is ignored by Git.
4. Install packages with `npm install`.
5. Run `npm run db:setup` once. This creates the `sereno_verde` database,
   tables, a restricted application user, and the initial administrator. It
   does not replace the password of an existing admin account.
6. Run `npm start` and open `http://127.0.0.1:3000`.

The admin login credentials are the `ADMIN_USERNAME` and `ADMIN_PASSWORD`
values from the first database setup. Change them later under Admin Settings.
Booking submissions are saved with pending status; the admin calendar can be
used to edit booking date, villa, stay type, and status. Guest records are
matched by email and show their booking count. Guest-submitted reviews are
stored separately for Tuscan and Spanish Villa.