set shell := ["bash", "-c"]

app_dir := "apps/web"
engine_dir := "apps/engine"
db_dir := "packages/db"

# Show all available commands
default:
    @just --list

# Install workspace dependencies
install:
    bun install

# Refresh the root lockfile without reinstalling everything
lockfile:
    bun run lockfile:generate

# Start all services: PostgreSQL → web + api + engine in parallel
dev: db-start
    bun run dev

# Build all workspaces
build:
    bun run build

# Run all tests
test:
    bun run test

# Lint all workspaces
lint:
    bun run lint

# Format all workspaces
format:
    bun run format

# Run all project checks
check:
    bun run check

# Typecheck all workspaces
typecheck:
    bun run typecheck

# Clean build outputs across the monorepo
clean:
    bun run clean

# Start only the web app
web-dev:
    cd {{app_dir}} && bun run dev

# Build the web app
web-build:
    cd {{app_dir}} && bun run build

# Preview the web production build
web-preview:
    cd {{app_dir}} && bun run preview

# Start the web production server
web-start:
    cd {{app_dir}} && bun run start

# Lint the web app
web-lint:
    cd {{app_dir}} && bun run lint

# Format the web app
web-format:
    cd {{app_dir}} && bun run format

# Run Biome checks for the web app
web-check:
    cd {{app_dir}} && bun run check

# Typecheck the web app
web-typecheck:
    cd {{app_dir}} && bun run typecheck

# Clean web build output
web-clean:
    cd {{app_dir}} && bun run clean

# Ensure PostgreSQL is running (init cluster on first run)
db-start:
    #!/usr/bin/env bash
    set -e
    if ! command -v pg_ctl &>/dev/null; then
      exec nix develop --command just db-start
    fi
    export PGDATA="$PWD/.postgres/data"
    export PGHOST="$PWD/.postgres"
    mkdir -p "$PGHOST"
    if [ ! -d "$PGDATA" ]; then
      echo "chess: initialising PostgreSQL cluster..."
      initdb --auth=trust --username=postgres --pgdata="$PGDATA" \
             --no-locale --encoding=UTF8
    fi
    if ! pg_ctl status -D "$PGDATA" 2>/dev/null | grep -q "server is running"; then
      echo "chess: starting PostgreSQL on localhost:5432..."
      pg_ctl start -D "$PGDATA" -l "$PGDATA/postgres.log" \
        -o "-p 5432 -k $PGHOST -h localhost" -w
      createdb -h localhost -p 5432 -U postgres chess 2>/dev/null || true
      echo "chess: PostgreSQL ready at localhost:5432/chess"
    fi

# Stop PostgreSQL
db-stop:
    #!/usr/bin/env bash
    if ! command -v pg_ctl &>/dev/null; then
      exec nix develop --command just db-stop
    fi
    export PGDATA="$PWD/.postgres/data"
    if pg_ctl status -D "$PGDATA" 2>/dev/null | grep -q "server is running"; then
      echo "chess: stopping PostgreSQL..."
      pg_ctl stop -D "$PGDATA" -m fast
    fi

# Generate Drizzle migrations
db-generate: db-start
    cd {{db_dir}} && bun run db:generate

# Apply pending Drizzle migrations
db-migrate: db-start
    cd {{db_dir}} && bun run db:migrate

# Open Drizzle Studio
db-studio:
    cd {{db_dir}} && bun run db:studio

# Start only the Rust engine
engine-dev:
    cd {{engine_dir}} && bun run dev

# Build the Rust engine
engine-build:
    cd {{engine_dir}} && bun run build

# Test the Rust engine
engine-test:
    cd {{engine_dir}} && bun run test

# Lint the Rust engine with clippy
engine-lint:
    cd {{engine_dir}} && bun run lint

# Format the Rust engine
engine-format:
    cd {{engine_dir}} && bun run format

# Run cargo check for the engine
engine-check:
    cd {{engine_dir}} && bun run check

# Clean Rust build artifacts
engine-clean:
    cd {{engine_dir}} && bun run clean

# Run a Turbo task for a specific workspace, e.g. `just turbo dev @chess/application`
turbo task filter:
    bunx turbo run {{task}} --filter={{filter}}
