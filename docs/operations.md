# Operations

## Production Topology

Run the web server behind a TLS-terminating reverse proxy. Route browser `/api`
requests to the Go API, serve the Vite build as static assets or through the
Vite preview-compatible server, and keep the Rust engine on a private network.
The API should be the only service allowed to reach PostgreSQL and the engine.

The repository does not include a container image, deployment manifest,
reverse-proxy configuration, or process supervisor. Choose and document those
parts in the deployment environment.

## Release Sequence

1. Build and test the commit in CI.
2. Build the web assets with `bunx nx run web:build`.
3. Build the API with `bunx nx run api:build`.
4. Build the engine with `bunx nx run engine:build`.
5. Publish the web assets, API binary, engine binary, and the exact ONNX model
   as one versioned release.
6. Apply migrations with `bun run api:migrate` or a release job before routing
   traffic to the new API.
7. Start the engine, verify its health and model provider, then start the API.
8. Route the web client only after the API health check succeeds.

For rollback, keep the previous API, engine, web assets, and model available as
a compatible release unit. Database migrations are forward-only in this
repository; design destructive schema changes as additive, staged migrations.

## Health Checks

Use:

```bash
curl -fsS https://api.example.com/api/health
curl -fsS http://engine.internal:8080/api/health
```

The API health endpoint only proves that the HTTP process responds. It is not a
database readiness or dependency check. The engine health response indicates
whether the DQN model loaded and whether the provider is `CUDA` or `CPU`.

For a complete smoke test, sign in with a test account, load a board, request
legal moves, submit a move, and make a controlled engine request. Do not use a
real user account or production game for this test.

## Logging and Monitoring

The services currently log to standard output. Important messages include:

- API startup and listen address
- migration failures
- engine request failures and invalid responses
- DQN provider selection and inference fallback
- request panic recovery

The application does not currently emit structured logs, metrics, traces,
request IDs, or a dependency-aware readiness endpoint. A production platform
should add log collection, alerting for 5xx responses and latency, database
connection saturation, queue depth, engine availability, and DQN fallback rate.

## Incident Procedures

### API cannot start

1. Confirm `DATABASE_URL` exists and the database accepts connections.
2. Check migration errors and `schema_migrations`.
3. Verify `WEB_ORIGIN`, `AUTH_BASE_URL`, and secret configuration.
4. Start the API with the same environment used by the process manager.

### Computer games do not advance

1. Check API logs for engine request failures.
2. Check engine health and model path.
3. Confirm API `CHESS_ENGINE_URL` points to the engine network address.
4. Confirm the engine can parse the submitted FEN and has legal moves.
5. Reset or retry the affected game after dependency recovery.

### Database migration failure

1. Stop new API instances that can retry the same migration.
2. Preserve the migration error and database snapshot.
3. Check the migration version and transaction state.
4. Fix the migration or data precondition in a new reviewed release.
5. Re-run the migration job and verify the application smoke test.

Never manually mark a migration applied without verifying the complete schema.

## Capacity Notes

The client polls active games and queues once per second. API and PostgreSQL
capacity must be sized for this read pattern as well as move writes. DQN uses a
single in-memory ONNX session protected by a mutex, so concurrent DQN requests
serialize through inference. Limit or queue engine requests at the deployment
layer if latency or memory becomes a concern.
