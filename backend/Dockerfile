# ==========================================
# Backend Production Dockerfile for Render
# ==========================================

# 1. Go Build Stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy backend source
COPY . .

# Build optimized binary
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o whatomate ./cmd/whatomate

# 2. Piper TTS Download Stage
FROM debian:bookworm-slim AS piper-dl
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

# 3. Final Minimal Runtime Image
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies (transcoding, voice TTS, certificates)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tzdata espeak-ng opus-tools ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled backend binary
COPY --from=builder /app/whatomate .

# Copy default config template (Render env vars take precedence)
COPY --from=builder /app/config.example.toml ./config.toml

# Install Piper TTS binary + voice models
COPY --from=piper-dl /tmp/piper/piper /usr/local/bin/piper
COPY --from=piper-dl /tmp/piper/lib*.so* /usr/local/lib/
COPY --from=piper-dl /tmp/piper/espeak-ng-data /usr/share/espeak-ng-data
RUN ldconfig
COPY --from=piper-dl /tmp/piper-models /opt/piper/models

# Create storage directories
RUN mkdir -p /app/uploads /app/audio

# Default Render HTTP port
EXPOSE 8080

ENTRYPOINT ["./whatomate"]
CMD ["server", "-config", "config.toml", "-migrate"]
