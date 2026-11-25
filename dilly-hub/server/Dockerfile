FROM rust:1-slim AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/dilly-hub-server /usr/local/bin/dilly-hub-server
ENV PORT=8083
EXPOSE 8083
CMD ["dilly-hub-server"]
