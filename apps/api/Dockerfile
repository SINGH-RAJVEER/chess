# Build with podman from the repository root:
#   podman build -f apps/api/Dockerfile -t sixtyfour-api .
#
# The API serves computer moves through persistent, bounded UCI workers: the
# sixtyfour-engine binary built from apps/engine (minimax and custom) and
# Debian's stockfish package. The two build stages are independent, and the
# Go binary is pure Go (CGO_ENABLED=0).

FROM docker.io/library/rust:1.97-slim-trixie AS engine-builder
WORKDIR /build
COPY apps/engine/Cargo.toml apps/engine/Cargo.lock ./
COPY apps/engine/src ./src
RUN cargo build --release --bin sixtyfour-engine

FROM docker.io/library/golang:1.26-trixie AS api-builder
WORKDIR /build
COPY apps/api/go.mod apps/api/go.sum ./apps/api/
COPY apps/api ./apps/api
WORKDIR /build/apps/api
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api

FROM docker.io/library/debian:trixie-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates stockfish \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=engine-builder /build/target/release/sixtyfour-engine /usr/local/bin/sixtyfour-engine
COPY --from=api-builder /out/api /usr/local/bin/api
ENV HOST=0.0.0.0 \
	PORT=4000 \
	ENGINE_PATH=/usr/local/bin/sixtyfour-engine \
	STOCKFISH_PATH=/usr/games/stockfish
EXPOSE 4000
ENTRYPOINT ["api"]
