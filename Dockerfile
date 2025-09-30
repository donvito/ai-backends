# --- Stage 1: Get the ollama binary from the official image ---
FROM ollama/ollama:latest AS ollama_src

# --- Stage 2: Build the application ---
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY . .
RUN bun install --frozen-lockfile --production

# --- Stage 3: Final image ---
FROM oven/bun:1
WORKDIR /app

# Install curl for healthcheck and procps for pkill
RUN apt-get update && apt-get install -y curl procps && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy application from builder stage
COPY --from=builder /app .

# Copy ollama binary from the official ollama image
COPY --from=ollama_src /bin/ollama /usr/local/bin/ollama
RUN chmod +x /usr/local/bin/ollama

# Pull the model. This will bake the model into the image
RUN OLLAMA_HOST=0.0.0.0:11434 /usr/local/bin/ollama serve & \
    sleep 15 && \
    /usr/local/bin/ollama pull gemma3:270m && \
    pkill ollama

# Copy the start script
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 3000
EXPOSE 11434
# Start the application using the start script
CMD ["./start.sh"]