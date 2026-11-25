FROM rust:1-slim AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/dillyverse-server /usr/local/bin/dillyverse-server
ENV PORT=8080
EXPOSE 8080
CMD ["dillyverse-server"]
