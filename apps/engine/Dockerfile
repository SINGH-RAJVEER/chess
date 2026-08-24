FROM rust:1.97-slim-trixie AS builder
WORKDIR /build
RUN apt-get update \
	&& apt-get install -y --no-install-recommends pkg-config libssl-dev g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release
COPY src ./src
RUN touch src/main.rs && cargo build --release --bin chess
RUN mkdir -p /dylibs; cp target/release/libonnxruntime* /dylibs/ 2>/dev/null || true

FROM debian:trixie-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/chess /usr/local/bin/engine
COPY --from=builder /dylibs/ /app/lib/
ENV LD_LIBRARY_PATH=/app/lib \
	ENGINE_HOST=0.0.0.0 \
	ENGINE_PORT=8080 \
	CHESS_MODEL_PATH=/models/model.onnx
EXPOSE 8080
ENTRYPOINT ["engine"]
