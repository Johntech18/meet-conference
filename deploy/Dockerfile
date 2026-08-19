FROM livekit/livekit-server:latest

# Copy custom config
COPY livekit.yaml /etc/livekit.yaml

# Expose ports: 7880 (WebSocket), 7881 (RTC/TCP), 50000-60000 (RTC/UDP)
EXPOSE 7880 7881 50000-60000/udp

CMD ["livekit-server", "--config", "/etc/livekit.yaml", "--bind", "0.0.0.0"]
