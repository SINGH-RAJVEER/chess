# Chess Monorepo (Turborepo)

A full-stack chess application built as a Turbo monorepo with shared workspace packages.

## Workspace Packages

- `application` — Web UI (SolidStart/Bun)
- `engine` — Rust chess engine service
- `packages/types` — Shared TypeScript types (Color, PieceType, GameStatus, etc.)
- `packages/db` — Database schema, migrations, and Drizzle ORM client

## Prerequisites

- Bun `>= 1.0`
- Rust toolchain (`cargo`, `rustfmt`, `clippy`)
- PostgreSQL database

## Install dependencies

```bash
bun install
```

## Run from root

```bash
bun run dev        # Start all services (app + engine)
bun run build      # Build all packages
bun run test       # Test all packages
bun run lint       # Lint all packages
bun run format     # Format all packages
bun run typecheck  # Check types
bun run check      # Biome check
bun run clean      # Clean all output
```

## Run a single workspace package

```bash
bunx turbo run dev --filter=@chess/application
bunx turbo run dev --filter=@chess/engine
bunx turbo run build --filter=@chess/db
```

## Database Management

Run from the `application` folder (where drizzle.config.ts points to packages/db):

```bash
cd application
bun run db:generate  # Generate migrations from schema changes
bun run db:migrate   # Apply pending migrations
bun run db:studio    # Open Drizzle Studio UI
```

## Project Layout

```text
.
├── application/              # Web app (SolidStart)
├── engine/                   # Rust chess engine
├── packages/
│   ├── db/                  # Database layer (@chess/db)
│   │   ├── drizzle/
│   │   └── src/
│   │       ├── index.ts     # DB client & schema exports
│   │       └── schema.ts    # Drizzle table definitions
│   └── types/               # Shared types (@chess/types)
│       └── src/
│           ├── board.ts     # Board types
│           ├── chess.ts     # Game types
│           └── index.ts     # Main export
├── package.json             # Root workspace config
├── turbo.json               # Turbo build configuration
└── docker-compose.yml       # Local dev environment
```

## Architecture

- **Shared Types Package**: All domain types (Color, PieceType, GameStatus, etc.) are defined in `@chess/types` and imported across projects
- **Database Package**: Schema, migrations, and client initialization live in `@chess/db`; application code imports from this package
- **Application**: Depends on both `@chess/types` and `@chess/db` workspace packages
- **Engine**: Pure Rust, no direct dependencies on other workspace packages (uses HTTP API)

## Development

The monorepo uses Turbo for task orchestration. Each package can have independent `build`, `dev`, `test`, `lint`, etc. scripts that Turbo runs in dependency order.
