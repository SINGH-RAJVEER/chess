# Operations

## Production Topology

Run the web server behind a TLS-terminating reverse proxy. Route browser `/api`
requests to the Go API and serve the Vite build as static assets or through the
Vite preview-compatible server. Computer moves are computed in-process by the
API through the linked Rust engine library; there is no engine network service
to isolate or scale separately. The API should be the only service allowed to
reach PostgreSQL.

Podman-ready Dockerfiles ship with each app (see docker.md). The repository
does not include a deployment manifest, reverse-proxy configuration, or
process supervisor. Choose and document those parts in the deployment
environment.

## Release Sequence

1. Build and test the commit in CI.
2. Build the web assets with `just web-build`.
3. Build the API with `just api-build` (links the Rust engine static library).
4. Publish the web assets and the API binary as one versioned release.
5. Apply migrations with `bun run api:migrate` or a release job before routing
   traffic to the new API.
6. Start the API, verify its health, then route the web client to it.

For rollback, keep the previous API binary and web assets available as
a compatible release unit. Database migrations are forward-only in this
repository; design destructive schema changes as additive, staged migrations.

## Health Checks

Use:

```bash
curl -fsS https://api.example.com/api/health
```

The API health endpoint only proves that the HTTP process responds. It is not a
database readiness or dependency check.

For a complete smoke test, sign in with a test account, load a board, request
legal moves, submit a move, and make a vs-computer move to exercise the
in-process engine. Do not use a real user account or production game for this test.

## Logging and Monitoring

The services currently log to standard output. Important messages include:

- API startup and listen address
- migration failures
- engine busy saturation and engine move failures
- request panic recovery

The application does not currently emit structured logs, metrics, traces,
request IDs, or a dependency-aware readiness endpoint. A production platform
should add log collection, alerting for 5xx responses and latency, database
connection saturation, queue depth, and engine saturation rate.

## Incident Procedures

### API cannot start

1. Confirm `DATABASE_URL` exists and the database accepts connections.
2. Check migration errors and `schema_migrations`.
3. Verify `WEB_ORIGIN`, `AUTH_BASE_URL`, and secret configuration.
4. Start the API with the same environment used by the process manager.

### Computer games do not advance

1. Check API logs for engine request failures or `engine busy` saturation.
2. Confirm `ENGINE_CUSTOM_MOVETIME_MS` / `ENGINE_CUSTOM_MAX_DEPTH` are sane;
   oversized budgets hold search slots and serialize computer games.
3. Confirm the API binary was built with the engine static library
   (`just api-build` builds `libchess.a` first); a stale library can
   desynchronize search behavior.
4. Reset or retry the affected game after recovery.

### Database migration failure

1. Stop new API instances that can retry the same migration.
2. Preserve the migration error and database snapshot.
3. Check the migration version and transaction state.
4. Fix the migration or data precondition in a new reviewed release.
5. Re-run the migration job and verify the application smoke test.

Never manually mark a migration applied without verifying the complete schema.

## Capacity Notes

The client polls active games and queues once per second. API and PostgreSQL
capacity must be sized for this read pattern as well as move writes.
Custom-engine searches run in-process and are bounded by a semaphore, so
concurrent computer games serialize past `NumCPU - 1` parallel searches.
Size API CPU for the expected number of concurrent computer games and the
`ENGINE_CUSTOM_MOVETIME_MS` budget.
