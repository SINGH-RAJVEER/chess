# Operations

## Production Topology

Run the web server behind a TLS-terminating reverse proxy. Route browser `/api` requests to the Go API and serve the Vite build as static assets or through the Vite preview-compatible server. Computer moves are computed by `sixtyfour-engine` and Stockfish child processes that the API keeps in a bounded pool; there is no engine network service to isolate or scale separately. The API should be the only service allowed to reach PostgreSQL.

Podman-ready Dockerfiles ship with each app (see docker.md). The repository does not include a deployment manifest, reverse-proxy configuration, or process supervisor. Choose and document those parts in the deployment environment.

## Release Sequence

1. Build and test the commit in CI.
2. Build the web assets with `just web-build`.
3. Build the API with `just api-build` (also builds the `sixtyfour-engine` binary).
4. Publish the web assets, the API binary, and the `sixtyfour-engine` binary as one versioned release.
5. Apply migrations with `bun run api:migrate` or a release job before routing traffic to the new API.
6. Start the API, verify its health, then route the web client to it.

For rollback, keep the previous API binary, `sixtyfour-engine` binary, and web assets available as a compatible release unit. Database migrations are forward-only in this repository; design destructive schema changes as additive, staged migrations.

## Health Checks

Use:

```bash
curl -fsS https://api.example.com/api/health
```

The API health endpoint only proves that the HTTP process responds. It is not a database readiness or dependency check.

For a complete smoke test, sign in with a test account, load a board, request legal moves, submit a move, and make a vs-computer move to exercise the `sixtyfour-engine` binary. Do not use a real user account or production game for this test.

## Logging and Monitoring

The services currently log to standard output. Important messages include:

- API startup and listen address
- migration failures
- engine busy saturation and engine move failures
- request panic recovery

The application does not currently emit structured logs, metrics, traces, request IDs, or a dependency-aware readiness endpoint. A production platform should add log collection, alerting for 5xx responses and latency, database connection saturation, queue depth, and engine saturation rate.

## Incident Procedures

### API cannot start

1. Confirm `DATABASE_URL` exists and the database accepts connections.
2. Check migration errors and `schema_migrations`.
3. Verify `WEB_ORIGIN`, `AUTH_BASE_URL`, and secret configuration.
4. Start the API with the same environment used by the process manager.

### Computer games do not advance

1. Check API logs for engine request failures or `engine busy` saturation.
2. Check client `sixtyfourLatency.summary()` and server `move latency` / `engine latency` logs. The application budget is fixed at 500 ms. Separate cold startup, engine time, commit time, and render overhead before changing deployment capacity.
3. Confirm the engine binaries resolve in the API process environment: `sixtyfour-engine` from `ENGINE_PATH` or `PATH` (a missing binary rejects minimax and custom moves with `SixtyFour engine is not installed on the server`), and Stockfish from `STOCKFISH_PATH` or `PATH` (`stockfish is not installed on the server`).
4. Look for `sixtyfour-engine timed out` or `exited without a move` in the logs. Each is one killed or crashed engine process; the API keeps serving. Confirm the deployed `sixtyfour-engine` came from the same release as the API.
5. Reset or retry the affected game after recovery.

### Database migration failure

1. Stop new API instances that can retry the same migration.
2. Preserve the migration error and database snapshot.
3. Check the migration version and transaction state.
4. Fix the migration or data precondition in a new reviewed release.
5. Re-run the migration job and verify the application smoke test.

Never manually mark a migration applied without verifying the complete schema.

## Capacity Notes

Clients receive committed snapshots over WebSockets and use bundled legal destinations. The server ticker reconciles active rooms once per second. Server engines reserve `max(1, min(GOMAXPROCS - 1, 4))` search slots before accepting a human computer-game move; excess work is rejected rather than queued after commit. Client computer games run locally and archive outside the move path. Benchmark concurrency, cold starts, and p95 against an isolated server before sizing API CPU and memory.
