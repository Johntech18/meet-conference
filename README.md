# 🎬 Meet — Google Meet Clone

A real-time video conferencing app built with **LiveKit** (open-source WebRTC SFU), featuring a fully custom Google Meet-style UI.

## Features

- ✅ **Video/Audio calls** — adaptive video grid, camera/mic toggles
- ✅ **Screen sharing** — share your screen with other participants
- ✅ **Emoji reactions** — 👍👏😂😮❤️ synced to all participants in real-time
- ✅ **Hand raise** — ✋ synced via LiveKit data channels
- ✅ **In-call chat** — text messages synced to all participants
- ✅ **Participant list** — live count and list of everyone in the room
- ✅ **Join/leave sounds** — audio notifications via Web Audio API
- ✅ **Lobby** — camera preview, name input, mic/cam toggles before joining
- ✅ **Responsive** — works on desktop, tablet, and mobile
- ✅ **Dark theme** — Google Meet-inspired dark UI

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     Frontend    │────▶│  Token Server    │────▶│  LiveKit Server │
│  (Vercel)       │     │ (CF Worker)      │     │  (Railway)      │
│  HTML/JS/CSS    │     │  JWT tokens      │     │  WebRTC SFU     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                                              │
        └──────────── WebRTC (video/audio) ────────────┘
```

| Component | Technology | Purpose |
|---|---|---|
| Frontend | Vanilla HTML/JS/CSS | Custom UI, video grid, controls |
| Token Server | Cloudflare Workers | Generates LiveKit JWT access tokens |
| LiveKit Server | Go (self-hosted) | WebRTC SFU — routes video/audio between users |
| Local Dev | Express.js | Combined static server + token generation |

## Quick Start (Local Development)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [LiveKit CLI](https://docs.livekit.io/quickstart/) (for local server)

### 1. Install LiveKit Server

**macOS:**
```bash
brew install livekit
```

**Linux:**
```bash
curl -sSL https://get.livekit.io | bash
```

**Windows:**
Download from [GitHub Releases](https://github.com/livekit/livekit/releases)

### 2. Start LiveKit in Dev Mode

```bash
livekit-server --dev
```

This starts a local LiveKit server at `ws://localhost:7880` with:
- API Key: `devkey`
- API Secret: `secret`

### 3. Start the App

```bash
# Install dependencies
cd server && npm install

# Start the server
npm run dev
```

### 4. Open in Browser

```
http://localhost:3000
```

### 5. Test with Multiple Users

Open two browser tabs and join the same room. Or use the CLI to simulate a participant:

```bash
lk room join \
    --url ws://localhost:7880 \
    --api-key devkey --api-secret secret \
    --identity test-user \
    --publish-demo \
    my-room
```

## Project Structure

```
meet-clone/
├── package.json              # Root scripts
├── README.md                 # This file
│
├── public/                   # Frontend (deploys to Vercel)
│   ├── index.html            # Landing page + meeting room
│   ├── vercel.json           # Vercel config (API rewrites)
│   ├── css/style.css         # Full dark theme stylesheet
│   └── js/
│       ├── landing.js        # New meeting / join by code
│       └── meeting.js        # LiveKit video, controls, reactions, chat
│
├── server/                   # Local dev server
│   ├── package.json
│   └── index.js              # Express: serves files + generates tokens
│
├── worker/                   # Cloudflare Worker (production tokens)
│   ├── package.json
│   ├── wrangler.toml
│   └── index.js              # Token API for Cloudflare Workers
│
└── deploy/                   # LiveKit server deployment
    ├── Dockerfile            # Docker image for LiveKit
    ├── livekit.yaml          # LiveKit server config
    └── railway.json          # Railway deploy config
```

## Deployment Guide

### Step 1: Deploy LiveKit Server (Railway)

The LiveKit server is the media server that handles all WebRTC connections. It needs to run 24/7.

**Option A: Railway (easiest)**

1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select the repo
4. Railway will detect the `Dockerfile` in `/deploy`
5. Set environment variables:
   ```
   LIVEKIT_API_KEY=your-production-key
   LIVEKIT_API_SECRET=your-production-secret
   ```
6. Deploy — you'll get a URL like `wss://your-app.up.railway.app`

**Option B: Fly.io**

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch
cd deploy
fly launch

# Deploy
fly deploy
```

**Option C: Render**

1. Create a new **Docker** service on [render.com](https://render.com)
2. Connect your GitHub repo
3. Set **Dockerfile path** to `deploy/Dockerfile`
4. Set environment variables:
   ```
   LIVEKIT_API_KEY=your-production-key
   LIVEKIT_API_SECRET=your-production-secret
   ```
5. Deploy — you'll get a URL like `https://your-app.onrender.com`

> **Note:** Use the "Docker" service type, not "Web Service". Docker is required for the container to run.

**Generate secure credentials for production:**

```bash
# Generate random key/secret
LK_KEY=$(openssl rand -hex 12)
LK_SECRET=$(openssl rand -hex 24)
echo "API Key: $LK_KEY"
echo "API Secret: $LK_SECRET"
```

### Step 2: Deploy Token Server (Cloudflare Workers)

The token server generates JWT access tokens. It's stateless and runs at the edge.

```bash
cd worker

# Install wrangler (Cloudflare CLI)
npm install

# Login to Cloudflare
npx wrangler login

# Set your LiveKit credentials as secrets
npx wrangler secret put LIVEKIT_API_KEY
# Paste your API key when prompted

npx wrangler secret put LIVEKIT_API_SECRET
# Paste your API secret when prompted

npx wrangler secret put LIVEKIT_URL
# Paste your LiveKit server URL (e.g. wss://your-app.up.railway.app)

# Deploy
npx wrangler deploy
```

You'll get a URL like: `https://meet-token-worker.your-subdomain.workers.dev`

### Step 3: Deploy Frontend (Vercel)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo
3. Set the **Root Directory** to `public`
4. Before deploying, update `public/vercel.json` with your Cloudflare Worker URL:

```json
{
    "rewrites": [
        { "source": "/api/token", "destination": "https://meet-token-worker.YOUR_SUBDOMAIN.workers.dev/api/token" },
        { "source": "/api/health", "destination": "https://meet-token-worker.YOUR_SUBDOMAIN.workers.dev/api/health" }
    ]
}
```

5. Deploy

### Step 4: Update LiveKit Config

Update `deploy/livekit.yaml` with production credentials:

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true

keys:
  your-production-key: your-production-secret

logging:
  level: info
```

## Environment Variables

### Express Server (Local Dev)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `LIVEKIT_API_KEY` | `devkey` | LiveKit API key |
| `LIVEKIT_API_SECRET` | `secret` | LiveKit API secret |
| `LIVEKIT_URL` | `http://localhost:7880` | LiveKit server URL |

### Cloudflare Worker (Production)

Set via `wrangler secret put`:

| Secret | Description |
|---|---|
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_URL` | LiveKit server WebSocket URL (e.g. `wss://your-server.fly.dev`) |

## Cost Breakdown

| Service | Free Tier | Paid |
|---|---|---|
| **Vercel** (frontend) | ✅ Generous | $20/mo |
| **Cloudflare Workers** (tokens) | ✅ 100k req/day | $5/mo |
| **Railway** (LiveKit server) | ✅ $5 credit/mo | $20/mo |
| **Hetzner VPS** (alternative) | — | ~$5/mo |

**Total for testing: $0/month** (all free tiers)

**Total for production: $5-25/month** depending on traffic

## How It Works

### Token Flow

1. User clicks "Join now" in the lobby
2. Frontend requests a token from `/api/token` with `{ roomName, identity, name }`
3. Token server generates a JWT with room join permissions
4. Frontend connects to LiveKit server using the token
5. LiveKit server validates the token and establishes WebRTC connections

### Data Sync (Reactions, Chat, Hand Raise)

All real-time features sync through LiveKit's built-in data channels — no extra server needed:

```js
// Send
room.localParticipant.sendData(
    new TextEncoder().encode(JSON.stringify({ type: 'emoji', emoji: '👍' })),
    { reliable: true }
);

// Receive
room.on('dataReceived', (payload) => {
    const data = JSON.parse(new TextDecoder().decode(payload));
    // Handle emoji, chat, handRaise...
});
```

## License

MIT
