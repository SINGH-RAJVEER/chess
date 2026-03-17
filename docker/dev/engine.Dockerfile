FROM rust:slim-bookworm

WORKDIR /app/apps/engine

RUN cargo install cargo-watch

EXPOSE 8080

CMD ["cargo", "watch", "-x", "run"]
