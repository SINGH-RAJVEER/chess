# Data Model

PostgreSQL is the API's system of record. Migrations are embedded into the Go
binary from `apps/api/internal/database/migrations/*.sql` and applied in
numeric filename order.

## Migration Process

1. The API opens and pings `DATABASE_URL`.
2. A PostgreSQL advisory lock serializes migration runners.
3. The API creates `schema_migrations` if necessary.
4. Each unapplied migration runs in its own transaction and is recorded by
   version and filename.

Use `bun run api:migrate` or `just api-migrate` for an explicit migration.
Startup migration is available with `AUTO_MIGRATE=true`. Do not edit an already
applied migration; add a new numbered migration instead.

## Authentication Tables

- `user`: identity, display name, email, verification state, and timestamps.
- `session`: seven-day session records, token, expiry, user agent, IP address,
  and user foreign key.
- `account`: provider accounts and credential password values used by the
  compatibility auth schema.
- `password`: password hashes for databases that use the separate password
  table shape.
- `verification`: reserved verification records from the auth schema.

User and session data use cascading deletion for dependent records. Passwords
are normalized with Unicode NFKC and hashed with scrypt; raw passwords are not
stored.

## Chess Tables

- `games`: turn, status, mode, time control, increment, remaining clocks,
  player IDs, draw offer, half-move clock, and timestamps.
- `queue`: player waiting entries keyed by requested time control and increment.
- `pieces`: current piece positions and movement state for each game.
- `moves`: append-style move records with source/destination, piece metadata,
  captures, promotions, move number, and timestamp.

The schema currently relies on application logic rather than foreign keys from
game player IDs to `user`. Queue entries and game mutations should therefore
be validated at the API boundary before exposing them to untrusted clients.

## Game State Rules

The API stores the current board in `pieces` and reconstructs a legal chess
position with the move history before accepting a mutation. It tracks:

- `Ongoing`
- `Checkmate`
- `Stalemate`
- `Timeout`
- `Resignation`
- `Draw`
- `InsufficientMaterial`
- `ThreefoldRepetition`
- `FiftyMoveRule`

Clock values are stored in milliseconds. `timeControl` is expressed in minutes
at the API boundary and `increment` in seconds. A zero time control uses a very
large sentinel remaining-time value and disables timeout calculations.

## Backup and Restore

Backup and restore are not implemented by the repository. Production operators
must back up PostgreSQL, including the migration metadata and all chess state,
using the managed database provider or a tested `pg_dump`/restore process.
Test restoration before relying on it. Restoring only `games` without
`pieces`/`moves`, or only users without sessions, produces an inconsistent
application state.
