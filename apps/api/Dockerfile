# Build context is the repository root:
#   docker build -f apps/api/Dockerfile .
#
# The API serves computer moves in-process through the Rust engine static
# library, so the image builds the cdylib first and then the CGO-enabled Go
# binary. No standalone engine service is needed at runtime.

FROM rust:1.97-slim-trixie AS engine-builder
WORKDIR /build
COPY apps/engine/Cargo.toml apps/engine/Cargo.lock ./
COPY apps/engine/src ./src
RUN cargo build --release --lib

FROM golang:1.26-trixie AS api-builder
RUN apt-get update \
	&& apt-get install -y --no-install-recommends gcc \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY apps/api/go.mod apps/api/go.sum ./apps/api/
COPY apps/api ./apps/api
COPY apps/engine/Cargo.toml ./apps/engine/Cargo.toml
COPY --from=engine-builder /build/target/release/libchess.a ./apps/engine/target/release/libchess.a
WORKDIR /build/apps/api
RUN CGO_ENABLED=1 go build -o /out/api ./cmd/api

FROM debian:trixie-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=api-builder /out/api /usr/local/bin/api
ENV HOST=0.0.0.0 \
	PORT=4000
EXPOSE 4000
ENTRYPOINT ["api"]
