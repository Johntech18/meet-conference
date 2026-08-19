/**
 * Meet Clone — Server
 * Serves static files + generates LiveKit access tokens
 * For local development. In production:
 *   - Frontend → Vercel
 *   - Token API → Cloudflare Worker
 *   - LiveKit Server → Railway/Render/Fly.io
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { AccessToken, VideoGrant } = require('livekit-server-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// LiveKit credentials (set via env vars or use defaults for local dev)
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'http://localhost:7880';

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * POST /api/token
 * Generates a LiveKit access token for a user to join a room
 * Body: { roomName, identity, name }
 */
app.post('/api/token', async (req, res) => {
    try {
        const { roomName, identity, name } = req.body;

        if (!roomName || !identity) {
            return res.status(400).json({ error: 'roomName and identity are required' });
        }

        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: identity,
            name: name || identity,
        });

        // Grant permission to join the room and publish/subscribe
        const grant = new VideoGrant({
            room: roomName,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,  // For chat, reactions, hand raise
        });

        at.addGrant(grant);

        const token = await at.toJwt();

        res.json({
            token,
            url: LIVEKIT_URL,
        });
    } catch (err) {
        console.error('Token generation error:', err);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', livekitUrl: LIVEKIT_URL });
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🎬 Meet Clone server running at http://localhost:${PORT}`);
    console.log(`   LiveKit server: ${LIVEKIT_URL}`);
    console.log(`   API key: ${LIVEKIT_API_KEY}\n`);
});
