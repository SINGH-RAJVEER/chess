# Security

## Trust Boundaries

- The browser is untrusted and can alter every request payload and local-storage
  value.
- The API is the trust boundary for game rules and authentication.
- PostgreSQL is private infrastructure and must not be browser-accessible.
- The engine accepts FEN and opponent values from the API and should be private;
  its current CORS policy allows any origin.
- The ONNX model and training checkpoints are release artifacts, not secrets.

## Implemented Controls

- Passwords are normalized and hashed with scrypt.
- Sessions expire after seven days and are stored server-side in PostgreSQL.
- Session cookies are HTTP-only, `SameSite=Lax`, and marked `Secure` when
  `AUTH_BASE_URL` starts with `https://`.
- Google OAuth uses a state cookie and restricts callback redirects to
  `WEB_ORIGIN`.
- Chess moves are revalidated server-side using the current stored position.
- API database operations use parameterized SQL.
- API panic recovery prevents a handler panic from terminating the process.

## Production Requirements

Before exposing the application publicly:

- Set a unique, high-entropy `BETTER_AUTH_SECRET`; the built-in default is not
  acceptable outside local development.
- Use HTTPS for the web, API, and OAuth callback, and set exact production
  `WEB_ORIGIN` and `AUTH_BASE_URL` values.
- Keep PostgreSQL and the engine on private networks with firewall rules.
- Store OAuth credentials and database credentials in a secret manager.
- Add TLS, request limits, rate limiting, abuse detection, and centralized
  audit logging at the edge or service layer.
- Review cookie and proxy behavior when the API is behind a load balancer.
- Restrict game mutation and matchmaking operations to authenticated users and
  authorized game participants before treating the API as internet-facing.

## Current Risks and Gaps

The current implementation exposes several routes that accept `playerId`,
`gameId`, or `color` in the request without consistently deriving identity from
the authenticated session. The web UI uses authentication for online play, but
the API must enforce authorization independently. Treat this as a release
blocker for a public deployment.

The API CORS middleware allows wildcard origins when no configured origin is
provided, while the engine permits any origin. Set explicit origins and place
the engine behind a private network or authenticated internal channel.

The API has no built-in rate limiting, CSRF token, account lockout, password
reset, email verification workflow, or security event audit trail. Add these
controls according to the threat model and regulatory requirements of the
deployment.

## Secret Handling

Never log or commit:

- `DATABASE_URL` when it contains credentials
- `BETTER_AUTH_SECRET`
- Google client secrets
- session tokens or OAuth authorization codes

The web client currently caches user and session-shaped data in local storage
for UI restoration. The server-side HTTP-only cookie remains the authentication
authority; do not treat local storage as proof of identity.
