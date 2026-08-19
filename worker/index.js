/**
 * Cloudflare Worker — LiveKit Token Server
 * Deploy to Cloudflare Workers (free tier: 100k requests/day)
 *
 * Generate a JWT access token for LiveKit rooms.
 * POST /api/token
 * Body: { roomName, identity, name }
 *
 * Set secrets with:
 *   wrangler secret put LIVEKIT_API_KEY
 *   wrangler secret put LIVEKIT_API_SECRET
 *   wrangler secret put LIVEKIT_URL
 */

import { AccessToken, VideoGrant } from 'livekit-server-sdk';

export default {
    async fetch(request, env) {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        // Health check
        if (url.pathname === '/api/health') {
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Token generation
        if (url.pathname === '/api/token' && request.method === 'POST') {
            try {
                const { roomName, identity, name } = await request.json();

                if (!roomName || !identity) {
                    return new Response(
                        JSON.stringify({ error: 'roomName and identity are required' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
                    identity,
                    name: name || identity,
                });

                const grant = new VideoGrant({
                    room: roomName,
                    roomJoin: true,
                    canPublish: true,
                    canSubscribe: true,
                    canPublishData: true,
                });

                at.addGrant(grant);
                const token = await at.toJwt();

                return new Response(
                    JSON.stringify({ token, url: env.LIVEKIT_URL }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            } catch (err) {
                return new Response(
                    JSON.stringify({ error: 'Failed to generate token' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        return new Response('Not found', { status: 404, headers: corsHeaders });
    },
};
