FROM rust:1-slim AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/dilly-strike-server /usr/local/bin/dilly-strike-server
ENV PORT=8081
EXPOSE 8081
CMD ["dilly-strike-server"]
