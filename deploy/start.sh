#!/bin/bash
set -e

# LiveKit server version
LK_VERSION="${LIVEKIT_VERSION:-1.13.5}"
ARCH=$(uname -m)

# Map architecture
case "$ARCH" in
    x86_64)  ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    armv7l)  ARCH="arm" ;;
    *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

BINARY="livekit-server"
INSTALL_DIR="/usr/local/bin"
BINARY_PATH="$INSTALL_DIR/$BINARY"

# Download if not already installed
if [ ! -f "$BINARY_PATH" ]; then
    echo "==> Downloading livekit-server v${LK_VERSION} for linux-${ARCH}..."
    URL="https://github.com/livekit/livekit/releases/download/v${LK_VERSION}/livekit_${LK_VERSION}_linux_${ARCH}.zip"
    
    # Download zip
    curl -sL "$URL" -o /tmp/livekit.zip
    
    # Extract
    cd /tmp
    if command -v unzip &> /dev/null; then
        unzip -o livekit.zip
    else
        apt-get update && apt-get install -y unzip
        unzip -o livekit.zip
    fi
    
    # Move binary to PATH
    mv "$BINARY" "$INSTALL_DIR/"
    chmod +x "$BINARY_PATH"
    
    # Cleanup
    rm -f /tmp/livekit.zip
    echo "==> livekit-server installed successfully."
else
    echo "==> livekit-server already installed."
fi

# Generate config from environment variables if livekit.yaml doesn't exist
CONFIG_FILE="${LIVEKIT_CONFIG:-/etc/livekit.yaml}"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "==> Generating livekit config from environment variables..."
    cat > "$CONFIG_FILE" <<YAML
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  tcp_port: 7881
  use_external_ip: true
logging:
  level: info
keys:
  ${LIVEKIT_API_KEY:-devkey}: ${LIVEKIT_API_SECRET:-secret}
YAML
    echo "==> Config written to $CONFIG_FILE"
fi

# Start the server
echo "==> Starting livekit-server on port 7880..."
exec "$BINARY_PATH" --config "$CONFIG_FILE" --bind 0.0.0.0
