# Sereno Verde

## Local application and PostgreSQL setup

The website and admin dashboard run through the Express server. Booking
submissions, guest records, reviews, administrator accounts, theme settings,
and admin sessions are stored in PostgreSQL.

1. Install Node.js and PostgreSQL.
2. Create a database and set `DATABASE_URL` in `.env` to its connection URL.
   Also set `ADMIN_USERNAME`, `ADMIN_PASSWORD` (at least 12 characters), and a
   unique `SESSION_SECRET` of at least 32 characters. Generate a session secret
   with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   Keep `.env` private; it is ignored by Git.
3. Install packages with `npm install`.
4. Run `npm run db:setup` to create the tables and initial administrator.
   Existing administrator passwords are not replaced.
5. Run `npm start` and open `http://127.0.0.1:3000`.

Booking submissions are saved with pending status; the admin calendar can be
used to edit booking date, villa, stay type, and status. Guest records are
matched by email and show their booking count. Guest-submitted reviews are
stored separately for Tuscan and Spanish Villa.

## Deploying on Render

The Render Blueprint in `render.yaml` creates a PostgreSQL database and web
service, and connects them using Render's private database URL. Create a
Blueprint from this repository, then provide `ADMIN_USERNAME`,
`ADMIN_PASSWORD`, and a unique `SESSION_SECRET` of at least 32 characters when
prompted. The service initializes the database schema and initial admin
account before starting the server. Existing admin passwords are not replaced.
The `/api/health` health check verifies the database connection.

### Booking confirmation emails

When an administrator confirms a booking, the service emails the guest a
confirmation with the booking reference, date, stay, accommodation, guest
count, event, special requests, and check-in/check-out schedule. The email
includes the Sereno Verde logo. Entry is listed as 10 minutes before the
scheduled check-in time.

Gmail SMTP connections time out from Render's free instance, so confirmations
are sent through the Gmail API over HTTPS. Configure these environment
variables in Render (or local `.env`) before confirming bookings:

- `GMAIL_OAUTH_CLIENT_ID`: OAuth client ID from a Google Cloud project with the Gmail API enabled.
- `GMAIL_OAUTH_CLIENT_SECRET`: OAuth client secret for that client.
- `GMAIL_OAUTH_REFRESH_TOKEN`: refresh token authorized for the `https://www.googleapis.com/auth/gmail.send` scope.
- `GMAIL_FROM`: sender address authorized for the OAuth Gmail account, for example `Sereno Verde <bookings@gmail.com>`.

To obtain a refresh token, configure a Google OAuth client, add the account
as an authorized test user if the consent screen is in testing mode, and
authorize the Gmail `gmail.send` scope using the Google OAuth Playground with
the OAuth client's own credentials.

If email delivery fails or Gmail API credentials are missing, the booking is
not marked confirmed; the admin dashboard displays an error so the settings
can be fixed and the confirmation retried. A successful confirmation email
is only sent once for each booking.

The Blueprint uses Render's free PostgreSQL plan, which expires after 30 days.
Choose a paid database plan in `render.yaml` before relying on it for
persistent production data. A new Render database starts empty; existing
bookings in the former Aiven database are not copied automatically.
