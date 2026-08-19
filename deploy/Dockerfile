FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y curl unzip && \
    rm -rf /var/lib/apt/lists/*

# Download livekit-server binary directly
RUN curl -sL "https://github.com/livekit/livekit/releases/download/v1.13.5/livekit_1.13.5_linux_amd64.zip" -o /tmp/livekit.zip && \
    cd /tmp && unzip -o livekit.zip && \
    mv livekit-server /usr/local/bin/ && \
    chmod +x /usr/local/bin/livekit-server && \
    rm /tmp/livekit.zip

# Copy config
COPY livekit.yaml /etc/livekit.yaml

EXPOSE 7880 7881 50000-60000/udp

CMD ["livekit-server", "--config", "/etc/livekit.yaml", "--bind", "0.0.0.0"]
