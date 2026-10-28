# Frontend build stage
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend dependency files first for caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy frontend source and build
COPY frontend/ .
RUN npm run build

# Go build stage
FROM --platform=$BUILDPLATFORM golang:alpine AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /app/backend

# Enable automatic toolchain upgrades if needed
ENV GOTOOLCHAIN=auto

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy source code
COPY backend/ .

# Embed frontend build into Go binary
COPY --from=frontend-builder /app/frontend/dist/ ./internal/frontend/dist/

# Build the binary
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -ldflags="-s -w" -o whatomate ./cmd/whatomate

# Piper TTS download stage
FROM --platform=$BUILDPLATFORM debian:bookworm-slim AS piper-dl
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates && rm -rf /var/lib/apt/lists/*
RUN case "${TARGETARCH:-amd64}" in \
      amd64) PIPER_ARCH=x86_64 ;; \
      arm64) PIPER_ARCH=aarch64 ;; \
      *) PIPER_ARCH=x86_64 ;; \
    esac \
    && wget -q "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_${PIPER_ARCH}.tar.gz" -O /tmp/piper.tar.gz \
    && tar xf /tmp/piper.tar.gz -C /tmp \
    && rm /tmp/piper.tar.gz
RUN mkdir -p /tmp/piper-models \
    && wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx \
       -O /tmp/piper-models/en_US-lessac-medium.onnx \
    && wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json \
       -O /tmp/piper-models/en_US-lessac-medium.onnx.json

# Final production runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies (TTS: espeak-ng, opus-tools; transcoding: ffmpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tzdata espeak-ng opus-tools ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/backend/whatomate .

# Copy config example (overridden by env vars on Render)
COPY --from=builder /app/backend/config.example.toml ./config.toml

# Install Piper TTS binary + shared libraries
COPY --from=piper-dl /tmp/piper/piper /usr/local/bin/piper
COPY --from=piper-dl /tmp/piper/lib*.so* /usr/local/lib/
COPY --from=piper-dl /tmp/piper/espeak-ng-data /usr/share/espeak-ng-data
RUN ldconfig

# Install default voice model
COPY --from=piper-dl /tmp/piper-models /opt/piper/models

# Create directories
RUN mkdir -p /app/uploads /app/audio

# Expose port
EXPOSE 8080

ENTRYPOINT ["./whatomate"]
CMD ["server", "-config", "config.toml", "-migrate"]
