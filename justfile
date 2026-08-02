set shell := ["bash", "-c"]

# Show all available commands
default:
    @just --list

# Install workspace dependencies
install:
    bun install

# Refresh the root lockfile without reinstalling everything
lockfile:
    bun run lockfile:generate

# Start PostgreSQL, web, api, and engine via devenv
dev:
    #!/usr/bin/env bash
    set -e
    if ! command -v devenv &>/dev/null; then
      echo "chess: devenv is required. Install it, then run 'just dev' again." >&2
      exit 1
    fi
    if [ "$EUID" -eq 0 ]; then
      echo "chess: do not run 'just dev' with sudo; PostgreSQL refuses to run as root." >&2
      echo "chess: add your user to nix.settings.trusted-users, rebuild NixOS, then run 'just dev'." >&2
      exit 1
    fi
    NIXPKGS_ALLOW_UNFREE=1 exec devenv --impure up --tui=false

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
    bunx nx run web:dev

# Build the web app
web-build:
    bunx nx run web:build

# Preview the web production build
web-preview:
    bunx nx run web:preview

# Start the web production server
web-start:
    bunx nx run web:start

# Lint the web app
web-lint:
    bunx nx run web:lint

# Format the web app
web-format:
    bunx nx run web:format

# Run Biome checks for the web app
web-check:
    bunx nx run web:check

# Typecheck the web app
web-typecheck:
    bunx nx run web:typecheck

# Clean web build output
web-clean:
    bunx nx run web:clean

# Start the API
api-dev:
    bunx nx run api:dev

# Build the API
api-build:
    bunx nx run api:build

# Start the built API
api-start:
    bunx nx run api:start

# Test the API
api-test:
    bunx nx run api:test

# Apply the API's app-local migrations
api-migrate: database-start
    #!/usr/bin/env bash
    set -e
    if [ -f .env ]; then
      set -a
      source .env
      set +a
    fi
    cd apps/api
    CGO_ENABLED=0 go run ./cmd/api -migrate

# Ensure PostgreSQL is running (init cluster on first run)
database-start:
    #!/usr/bin/env bash
    set -e
    if [ -f .env ]; then
      set -a
      source .env
      set +a
    fi
    PGDATA="${PGDATA:-$PWD/.postgres/data}"
    PGHOST="${PGHOST:-localhost}"
    PGPORT="${PGPORT:-5432}"
    PGUSER="${PGUSER:-postgres}"
    PGDATABASE="${PGDATABASE:-chess}"
    if command -v pg_isready &>/dev/null && pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" &>/dev/null; then
      createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE" 2>/dev/null || true
      echo "chess: PostgreSQL ready at $PGHOST:$PGPORT/$PGDATABASE"
      exit 0
    fi
    if ! command -v pg_ctl &>/dev/null; then
      echo "chess: PostgreSQL tools are missing. Enter the devenv shell first." >&2
      exit 1
    fi
    mkdir -p "$(dirname "$PGDATA")"
    if [ ! -d "$PGDATA" ]; then
      echo "chess: initialising PostgreSQL cluster..."
      initdb --auth=trust --username="$PGUSER" --pgdata="$PGDATA" \
             --no-locale --encoding=UTF8
    fi
    if ! pg_ctl status -D "$PGDATA" 2>/dev/null | grep -q "server is running"; then
      echo "chess: starting PostgreSQL on $PGHOST:$PGPORT..."
      pg_ctl start -D "$PGDATA" -l "$PGDATA/postgres.log" \
        -o "-p $PGPORT -h $PGHOST" -w
      createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE" 2>/dev/null || true
      echo "chess: PostgreSQL ready at $PGHOST:$PGPORT/$PGDATABASE"
    fi

# Stop PostgreSQL
database-stop:
    #!/usr/bin/env bash
    if [ -f .env ]; then
      set -a
      source .env
      set +a
    fi
    if ! command -v pg_ctl &>/dev/null; then
      echo "chess: PostgreSQL tools are missing. Enter the devenv shell first." >&2
      exit 1
    fi
    PGDATA="${PGDATA:-$PWD/.postgres/data}"
    if pg_ctl status -D "$PGDATA" 2>/dev/null | grep -q "server is running"; then
      echo "chess: stopping PostgreSQL..."
      pg_ctl stop -D "$PGDATA" -m fast
    fi

# Start only the Rust engine
engine-dev:
    bunx nx run engine:dev

# Build the Rust engine
engine-build:
    bunx nx run engine:build

# Test the Rust engine
engine-test:
    bunx nx run engine:test

# Lint the Rust engine with clippy
engine-lint:
    bunx nx run engine:lint

# Format the Rust engine
engine-format:
    bunx nx run engine:format

# Run cargo check for the engine
engine-check:
    bunx nx run engine:check

# Clean Rust build artifacts
engine-clean:
    bunx nx run engine:clean

# Run an Nx target for a project, e.g. `just nx-target build web`
nx-target target project:
    bunx nx run {{project}}:{{target}}
