FROM rust:1-slim AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/dilly-gone-mad-server /usr/local/bin/dilly-gone-mad-server
ENV PORT=8082
EXPOSE 8082
CMD ["dilly-gone-mad-server"]
