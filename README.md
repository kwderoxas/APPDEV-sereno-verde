# Sereno Verde

## Local application and MySQL setup

The website and admin dashboard run through the local Express server. Booking
submissions, guest records, reviews, administrator accounts, theme settings,
and admin sessions are stored in MySQL.

1. Install Node.js and MySQL.
2. Create a local `.env` file with `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
   `DB_PASSWORD`, `DB_ROOT_USER`, `DB_ROOT_PASSWORD`, `ADMIN_USERNAME`, and
   `ADMIN_PASSWORD`, plus a unique `SESSION_SECRET` of at least 32 characters.
   `DB_ROOT_*` values are used only by the local setup script. Generate a
   session secret with
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   Keep `.env` private; it is ignored by Git.
3. Install packages with `npm install`.
4. Run `npm run db:setup` once to create the local database tables and initial
   administrator. It does not replace the password of an existing admin.
5. Run `npm start` and open `http://127.0.0.1:3000`.

The admin login credentials are the `ADMIN_USERNAME` and `ADMIN_PASSWORD`
values configured for the first database setup. Change them later under Admin Settings.
Booking submissions are saved with pending status; the admin calendar can be
used to edit booking date, villa, stay type, and status. Guest records are
matched by email and show their booking count. Guest-submitted reviews are
stored separately for Tuscan and Spanish Villa.

## Deploying on Render

The repository includes a Render Blueprint in `render.yaml`. In Render, create
a new Blueprint from this repository and provide the requested environment
variables. The service serves the frontend files from the repository root;
there is no `public/` directory.

Render's web service needs a separately hosted MySQL database that accepts
connections from Render. Render does not provide a built-in MySQL database.
Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` to that
database's connection details, and set `SESSION_SECRET` to a private random
value of at least 32 characters. Do not use `localhost` or your laptop's
database address for `DB_HOST`.

Create the required tables and initial admin account in the hosted database
before launching the service. The `/api/health` health check verifies database
connectivity, so the service will not be considered healthy until the database
is reachable.