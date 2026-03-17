set shell := ["bash", "-lc"]

app_dir := "apps/web"
engine_dir := "apps/engine"
compose_file := "docker/dev/docker-compose.yml"

# Show available recipes
default:
    @just --list

# Install workspace dependencies
install:
    bun install

# Refresh the root lockfile without reinstalling everything
lockfile:
    bun run lockfile:generate

# Start all dev services through Turbo
dev:
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

# Generate Drizzle migrations
db-generate:
    cd {{app_dir}} && bun run db:generate

# Apply pending Drizzle migrations
db-migrate:
    cd {{app_dir}} && bun run db:migrate

# Open Drizzle Studio
db-studio:
    cd {{app_dir}} && bun run db:studio

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

# Start the local Docker stack in the foreground
docker-up:
    docker compose -f {{compose_file}} up --build

# Start the local Docker stack in the background
docker-up-d:
    docker compose -f {{compose_file}} up --build -d

# Stop the local Docker stack
docker-down:
    docker compose -f {{compose_file}} down

# Tail logs from the local Docker stack
docker-logs:
    docker compose -f {{compose_file}} logs -f

# Show Docker service status
docker-ps:
    docker compose -f {{compose_file}} ps

# Run a Turbo task for a specific workspace, e.g. `just turbo dev @chess/application`
turbo task filter:
    bunx turbo run {{task}} --filter={{filter}}
