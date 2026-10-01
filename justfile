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

# Start PostgreSQL, web, and api via devenv (the API serves computer moves in-process)
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
    cd apps/web && exec bun run dev

# Build the web app
web-build:
    cd apps/web && bun run build

# Preview the web production build
web-preview:
    cd apps/web && bun run preview

# Start the web production server
web-start:
    cd apps/web && bun run start

# Lint the web app
web-lint:
    cd apps/web && bun run lint

# Format the web app
web-format:
    cd apps/web && bun run format

# Run Biome checks for the web app
web-check:
    cd apps/web && bun run check

# Typecheck the web app
web-typecheck:
    cd apps/web && bun run typecheck

# Test the web app
web-test:
    cd apps/web && bun run test

# Clean web build output
web-clean:
    cd apps/web && bun run clean

# Start the mobile app (Expo dev server; run inside devenv so Node is present)
mobile-dev:
    devenv shell -- bash -c 'cd apps/mobile && exec bun run dev'

# Run the mobile app on Android (requires Android SDK or a dev build)
mobile-android:
    devenv shell -- bash -c 'cd apps/mobile && exec bun run android'

# Run the mobile app on iOS (requires macOS with Xcode)
mobile-ios:
    devenv shell -- bash -c 'cd apps/mobile && exec bun run ios'

# Bundle the mobile app for iOS and Android without a device
mobile-export:
    devenv shell -- bash -c 'cd apps/mobile && exec bunx expo export'

# Lint the mobile app
mobile-lint:
    cd apps/mobile && bun run lint

# Format the mobile app
mobile-format:
    cd apps/mobile && bun run format

# Run Biome checks for the mobile app
mobile-check:
    cd apps/mobile && bun run check

# Typecheck the mobile app
mobile-typecheck:
    cd apps/mobile && bun run typecheck

# Test the mobile app
mobile-test:
    cd apps/mobile && bun run test

# Clean mobile build output
mobile-clean:
    cd apps/mobile && bun run clean

# Lint the shared types package
types-lint:
    cd libs/types && bun run lint

# Format the shared types package
types-format:
    cd libs/types && bun run format

# Run Biome checks for the shared types package
types-check:
    cd libs/types && bun run check

# Test the shared types package
types-test:
    cd libs/types && bun run test

# Start the API in the devenv shell (builds the engine static library first)
api-dev: engine-lib
    devenv shell -- bash -c 'cd apps/api && AUTO_MIGRATE=true CGO_ENABLED=1 go run ./cmd/api'

# Build the API in the devenv shell (builds the engine static library first)
api-build: engine-lib
    devenv shell -- bash -c 'cd apps/api && mkdir -p dist && CGO_ENABLED=1 go build -o dist/api ./cmd/api'

# Start the built API
api-start:
    cd apps/api && AUTO_MIGRATE=true CGO_ENABLED=1 ./dist/api

# Test the API (builds the engine static library first; needs a C toolchain)
api-test: engine-lib
    devenv shell -- bash -c 'cd apps/api && CGO_ENABLED=1 go test ./...'

# Vet the API (builds the engine static library first; needs a C toolchain)
api-lint: engine-lib
    devenv shell -- bash -c 'cd apps/api && CGO_ENABLED=1 go vet ./...'

# Format the API
api-format:
    cd apps/api && gofmt -w ./cmd ./internal

# Check the API (format, tests, vet; builds the engine static library first)
api-check: engine-lib
    cd apps/api && test -z "$(gofmt -l ./cmd ./internal)" && devenv shell -- bash -c 'cd apps/api && CGO_ENABLED=1 go test ./... && CGO_ENABLED=1 go vet ./...'

# Benchmark the API hot paths, including the engine FFI call (no database needed)
api-bench: engine-lib
    devenv shell -- bash -c 'cd apps/api && CGO_ENABLED=1 go test ./internal/game/ -bench=. -benchtime=100x -run=NONE'

# Apply the API's app-local migrations (builds the engine static library first)
api-migrate: engine-lib database-start
    #!/usr/bin/env bash
    set -e
    if [ -f .env ]; then
      set -a
      source .env
      set +a
    fi
    devenv shell -- bash -c 'cd apps/api && CGO_ENABLED=1 go run ./cmd/api -migrate'

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

# Build the Rust engine static library linked into the API
engine-lib:
    cd apps/engine && cargo build --release --lib

# Probe the engine over UCI on stdin (e.g. `position startpos`, `go movetime 100`)
engine-dev:
    cd apps/engine && cargo run

# Build the Rust engine
engine-build:
    cd apps/engine && cargo build --release

# Test the Rust engine
engine-test:
    cd apps/engine && cargo test

# Lint the Rust engine with clippy
engine-lint:
    cd apps/engine && cargo clippy --all-targets --all-features -- -D warnings

# Format the Rust engine
engine-format:
    cd apps/engine && cargo fmt --all

# Run cargo check for the engine
engine-check:
    cd apps/engine && cargo check

# Benchmark the engine (release eval plus a 10s search)
engine-bench:
    cd apps/engine && cargo test --release bench_eval -- --ignored --nocapture && cargo test --release bench_middlegame -- --ignored --nocapture

# SPRT self-play between two UCI engine binaries, e.g.
# just sprt -- --engine-a ./apps/engine/target/release/uci --engine-b /tmp/chess-baseline/uci --movetime 100 --max-games 2000
sprt *args:
    devenv shell -- bash -c 'cd apps/engine && cargo build --release --bin uci --bin sprt && ./target/release/sprt {{args}}'

# SPRT self-play of the working copy (engine A) against a baseline revision
# (engine B). Complements `just sprt`, which takes manual engine paths:
# this recipe checks the baseline revision out into a scratch jj workspace,
# builds it, and runs the match, so a whole comparison is one command.
#
# NOTE: pass arguments positionally (this just version mis-expands
# `name=value` overrides inside shebang recipes):
#   just sprt-baseline                                                        # bcfa baseline, 100ms/move, SPRT(0,10)
#   just sprt-baseline uzmzypwnkknn 200 0 5 0.05 0.05 10000 4
sprt-baseline baseline="bcfa3bba9059" movetime="100" elo0="0" elo1="10" alpha="0.05" beta="0.05" max_games="5000" concurrency="8":
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    cd "$root"
    engine="$root/apps/engine"
    base_work="$(mktemp -d "${TMPDIR:-/tmp}/chess-sprt-base-XXXXXX")"
    # The repo moves fast (parallel sessions); refresh so workspace
    # operations below do not fail on a stale working copy.
    jj workspace update-stale >/dev/null 2>&1 || true
    jj workspace forget sprt-base >/dev/null 2>&1 || true
    jj workspace add -r "{{baseline}}" --name sprt-base "$base_work" >/dev/null
    cleanup() { jj workspace forget sprt-base >/dev/null 2>&1 || true; rm -rf "$base_work"; }
    trap cleanup EXIT INT TERM
    mkdir -p "$base_work/apps/engine/src/bin" "$base_work/apps/engine/book"
    cp "$engine/src/bin/uci.rs" "$base_work/apps/engine/src/bin/uci.rs"
    cp "$engine/book/openings.book" "$base_work/apps/engine/book/openings.book"
    # Share the test target dir for the baseline build: builds run
    # sequentially, so registry-dependency artifacts are reused and only the
    # engine crate itself rebuilds. The baseline binary is stashed aside
    # before the test binaries are (re)built over it.
    export CARGO_TARGET_DIR="$engine/target"
    echo "chess: building baseline engine @ {{baseline}}..."
    (cd "$base_work/apps/engine" && cargo build --release --bin uci)
    cp "$engine/target/release/uci" "$base_work/base-uci"
    echo "chess: building test engine and referee from working copy..."
    (cd "$engine" && cargo build --release --bin uci --bin sprt)
    log="$root/sprt-{{baseline}}.log"
    echo "chess: SPRT match test=working copy base={{baseline}} movetime={{movetime}}ms SPRT({{elo0}},{{elo1}}) max_games={{max_games}} concurrency={{concurrency}}"
    echo "chess: log -> $log"
    set +e
    "$engine/target/release/sprt" \
        --engine-a "$engine/target/release/uci" \
        --engine-b "$base_work/base-uci" \
        --book "$engine/book/openings.book" \
        --movetime "{{movetime}}" \
        --elo0 "{{elo0}}" --elo1 "{{elo1}}" \
        --alpha "{{alpha}}" --beta "{{beta}}" \
        --max-games "{{max_games}}" \
        --concurrency "{{concurrency}}" 2>&1 | tee "$log"
    set -e
    if grep -q "sprt: PASSED" "$log"; then exit 0; else exit 1; fi

# Clean Rust build artifacts
engine-clean:
    cd apps/engine && cargo clean

# Start the desktop app (requires the web dev server on port 3000)
desktop-dev:
    cd apps/desktop && ELECTRON_RENDERER_URL=http://localhost:3000 bun run dev

# Build and bundle the desktop app (embeds a fresh apps/web/dist)
desktop-build: web-build
    cd apps/desktop && bun run build

# Test desktop package behavior
desktop-test:
    cd apps/desktop && bun test

# Lint Electron entry points
desktop-lint:
    cd apps/desktop && bun run lint

# Format Electron entry points
desktop-format:
    cd apps/desktop && bun run format

# Check Electron entry point syntax
desktop-check:
    cd apps/desktop && bun run check

# Clean desktop build artifacts
desktop-clean:
    cd apps/desktop && bun run clean
