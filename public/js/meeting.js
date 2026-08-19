/**
 * Meeting Logic — LiveKit
 * Handles: lobby, video connection, controls, reactions, hand raise, chat, participants
 * All synced between participants via LiveKit data channels (no extra server needed)
 */

(function () {
    'use strict';

    // ============================================
    // CONFIG
    // ============================================
    const API_BASE = window.MEET_API_BASE || '';  // Empty = local server handles tokens

    // ============================================
    // STATE
    // ============================================
    let room = null;            // LiveKit Room instance
    let localTrack = null;      // { camera, microphone }
    let micEnabled = true;
    let camEnabled = true;
    let handRaised = false;
    let meetingStartTime = null;
    let timerInterval = null;
    let lobbyStream = null;

    // ============================================
    // DOM
    // ============================================
    const lobby = document.getElementById('lobby');
    const lobbyVideo = document.getElementById('lobby-video');
    const lobbyVideoOff = document.getElementById('lobby-video-off');
    const lobbyAvatar = document.getElementById('lobby-avatar');
    const lobbyMicBtn = document.getElementById('lobby-mic-btn');
    const lobbyCamBtn = document.getElementById('lobby-cam-btn');
    const lobbyNameInput = document.getElementById('lobby-name');
    const joinNowBtn = document.getElementById('join-now-btn');
    const meetingPage = document.getElementById('meeting-page');
    const headerBar = document.getElementById('meeting-header-bar');
    const videoGrid = document.getElementById('video-grid');
    const controlBar = document.getElementById('control-bar');
    const roomLabel = document.getElementById('meeting-room-label');

    // ============================================
    // INIT LOBBY (called by landing.js)
    // ============================================
    window.initLobby = function () {
        const roomID = sessionStorage.getItem('meet_roomID') || 'test-room';
        let userID = sessionStorage.getItem('meet_userID');
        if (!userID) {
            userID = 'user-' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem('meet_userID', userID);
        }

        const savedName = localStorage.getItem('meet_userName') || '';
        lobbyAvatar.textContent = savedName ? savedName[0].toUpperCase() : '?';

        startCameraPreview();
        setTimeout(() => lobbyNameInput.focus(), 300);
    };

    // ============================================
    // CAMERA PREVIEW (lobby)
    // ============================================
    async function startCameraPreview() {
        try {
            lobbyStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            lobbyVideo.srcObject = lobbyStream;
            lobbyVideo.classList.remove('hidden');
            lobbyVideoOff.classList.add('hidden');
            camEnabled = true;
        } catch (err) {
            console.warn('Camera access denied:', err);
            lobbyVideo.classList.add('hidden');
            lobbyVideoOff.classList.remove('hidden');
            camEnabled = false;
        }
    }

    function stopCameraPreview() {
        if (lobbyStream) {
            lobbyStream.getTracks().forEach(t => t.stop());
            lobbyStream = null;
        }
    }

    // ============================================
    // LOBBY CONTROLS
    // ============================================
    lobbyMicBtn.addEventListener('click', () => {
        micEnabled = !micEnabled;
        lobbyMicBtn.classList.toggle('muted', !micEnabled);
    });

    lobbyCamBtn.addEventListener('click', () => {
        camEnabled = !camEnabled;
        lobbyCamBtn.classList.toggle('muted', !camEnabled);
        if (camEnabled) {
            startCameraPreview();
            lobbyVideo.classList.remove('hidden');
            lobbyVideoOff.classList.add('hidden');
        } else {
            stopCameraPreview();
            lobbyVideo.classList.add('hidden');
            lobbyVideoOff.classList.remove('hidden');
        }
    });

    lobbyNameInput.addEventListener('input', () => {
        const name = lobbyNameInput.value.trim();
        lobbyAvatar.textContent = name ? name[0].toUpperCase() : '?';
    });

    // ============================================
    // JOIN MEETING
    // ============================================
    joinNowBtn.addEventListener('click', joinMeeting);
    lobbyNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinMeeting(); });

    async function joinMeeting() {
        const name = lobbyNameInput.value.trim();
        if (!name) {
            lobbyNameInput.focus();
            lobbyNameInput.style.borderColor = '#ea4335';
            setTimeout(() => { lobbyNameInput.style.borderColor = ''; }, 2000);
            return;
        }

        const roomID = sessionStorage.getItem('meet_roomID');
        const userID = sessionStorage.getItem('meet_userID');
        if (!roomID || !userID) { alert('Something went wrong.'); return; }

        localStorage.setItem('meet_userName', name);
        joinNowBtn.disabled = true;
        joinNowBtn.innerHTML = '<div class="spinner"></div> Connecting...';

        try {
            stopCameraPreview();
            lobby.classList.remove('active');
            headerBar.style.display = 'flex';
            controlBar.style.display = 'flex';
            roomLabel.textContent = roomID;

            await connectToLiveKit(roomID, userID, name);
            startTimer();
        } catch (err) {
            console.error('Failed to join:', err);
            alert('Failed to join: ' + err.message);
            lobby.classList.add('active');
            headerBar.style.display = 'none';
            controlBar.style.display = 'none';
            joinNowBtn.disabled = false;
            joinNowBtn.textContent = 'Join now';
        }
    }

    // ============================================
    // LIVEKIT CONNECTION
    // ============================================
    async function connectToLiveKit(roomID, userID, userName) {
        const livekitClient = window.LivekitClient;

        // Get token from server
        let token, serverUrl;
        if (API_BASE) {
            // Production: token from Cloudflare Worker
            const resp = await fetch(`${API_BASE}/api/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: roomID, identity: userID, name: userName }),
            });
            if (!resp.ok) throw new Error('Failed to get token');
            ({ token, url: serverUrl } = await resp.json());
        } else {
            // Local dev: token from Express server
            const resp = await fetch('/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: roomID, identity: userID, name: userName }),
            });
            if (!resp.ok) throw new Error('Failed to get token');
            ({ token, url: serverUrl } = await resp.json());
        }

        // Create and connect room
        room = new livekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
        });

        // Handle events
        setupRoomEvents(room);

        await room.connect(serverUrl, token);

        // Publish local camera + microphone
        const tracks = await livekitClient.createLocalTracks({
            video: camEnabled,
            audio: micEnabled,
        });

        for (const track of tracks) {
            await room.localParticipant.publishTrack(track);
            if (track.kind === 'camera') localTrack = { ...localTrack, camera: track };
            if (track.kind === 'audio') localTrack = { ...localTrack, microphone: track };
        }

        // Handle screen sharing
        setupScreenSharing();

        // Setup controls
        setupControls();

        // Setup reactions + chat via data channel
        setupReactions();
        setupChat();
        setupParticipants();

        console.log('[Meet] Connected to room:', roomID);
    }

    // ============================================
    // ROOM EVENTS
    // ============================================
    function setupRoomEvents(room) {
        room.on('roomJoined', () => {
            updateVideoGrid();
            showNotification('You joined the meeting');
        });

        room.on('participantConnected', (participant) => {
            console.log('[Meet] Participant joined:', participant.identity);
            updateVideoGrid();
            updateParticipantCount();
            showNotification(`${participant.name || participant.identity} joined`);
            playSound('join');
        });

        room.on('participantDisconnected', (participant) => {
            console.log('[Meet] Participant left:', participant.identity);
            updateVideoGrid();
            updateParticipantCount();
            showNotification(`${participant.name || participant.identity} left`);
            playSound('leave');
        });

        room.on('trackSubscribed', (track, publication, participant) => {
            updateVideoGrid();
        });

        room.on('trackUnsubscribed', (track, publication, participant) => {
            track.detach();
            updateVideoGrid();
        });

        room.on('activeSpeakersChanged', () => {
            // Could highlight active speaker
        });

        room.on('dataReceived', (payload, participant, kind) => {
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                handleDataMessage(data, participant);
            } catch (e) { /* not our format */ }
        });

        room.on('disconnected', () => {
            console.log('[Meet] Disconnected from room');
        });
    }

    // ============================================
    // VIDEO GRID
    // ============================================
    function updateVideoGrid() {
        if (!room) return;
        videoGrid.innerHTML = '';

        const participants = Array.from(room.participants.values());
        const total = participants.length + 1; // +1 for local

        // Set grid class
        videoGrid.className = 'video-grid';
        if (total <= 1) videoGrid.classList.add('grid-1');
        else if (total === 2) videoGrid.classList.add('grid-2');
        else if (total <= 4) videoGrid.classList.add('grid-3-4');
        else videoGrid.classList.add('grid-5-6');

        // Local participant tile
        const localTile = createVideoTile(
            room.localParticipant,
            true
        );
        videoGrid.appendChild(localTile);

        // Remote participant tiles
        for (const participant of participants) {
            const tile = createVideoTile(participant, false);
            videoGrid.appendChild(tile);
        }

        updateParticipantCount();
    }

    function createVideoTile(participant, isLocal) {
        const tile = document.createElement('div');
        tile.className = 'video-tile';
        tile.dataset.identity = participant.identity;

        const name = participant.name || participant.identity;
        const initial = name[0] ? name[0].toUpperCase() : '?';

        // Avatar (shown when camera is off)
        const avatar = document.createElement('div');
        avatar.className = 'tile-avatar';
        avatar.textContent = initial;
        tile.appendChild(avatar);

        // Try to attach video track
        const videoPublication = isLocal
            ? participant.getTrack(livekitClient.Track.Source.Camera)
            : participant.getTrack(livekitClient.Track.Source.Camera);

        if (videoPublication && videoPublication.track) {
            const videoEl = videoPublication.track.attach();
            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
            videoEl.style.objectFit = 'cover';
            videoEl.style.position = 'absolute';
            videoEl.style.inset = '0';
            tile.appendChild(videoEl);
            avatar.style.display = 'none';
        }

        // Name label
        const nameLabel = document.createElement('div');
        nameLabel.className = 'tile-name';
        nameLabel.textContent = isLocal ? `${name} (You)` : name;
        tile.appendChild(nameLabel);

        // Mic-off indicator
        const micOff = document.createElement('div');
        micOff.className = 'tile-mic-off';
        micOff.textContent = '🔇';
        tile.appendChild(micOff);

        // Update mic-off indicator when track changes
        const updateMicIndicator = () => {
            const audioPub = participant.getTrack(livekitClient.Track.Source.Microphone);
            const isMuted = !audioPub || !audioPub.isMuted === false;
            // For local, check our state
            if (isLocal) {
                micOff.classList.toggle('visible', !micEnabled);
            } else {
                micOff.classList.toggle('visible', audioPub ? audioPub.isMuted : true);
            }
        };
        updateMicIndicator();

        // Update video visibility when tracks change
        if (!isLocal) {
            participant.on('trackPublished', (pub) => {
                if (pub.source === livekitClient.Track.Source.Camera) {
                    pub.on('subscribed', () => {
                        const videoEl = pub.track.attach();
                        videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;';
                        tile.insertBefore(videoEl, nameLabel);
                        avatar.style.display = 'none';
                    });
                    pub.on('unsubscribed', () => {
                        const existingVideo = tile.querySelector('video');
                        if (existingVideo) existingVideo.remove();
                        avatar.style.display = 'flex';
                    });
                }
                updateMicIndicator();
            });
        }

        return tile;
    }

    const livekitClient = window.LivekitClient;

    // ============================================
    // CONTROLS
    // ============================================
    function setupControls() {
        const micBtn = document.getElementById('ctrl-mic');
        const camBtn = document.getElementById('ctrl-camera');
        const screenBtn = document.getElementById('ctrl-screen');
        const leaveBtn = document.getElementById('ctrl-leave');
        const reactionsBtn = document.getElementById('ctrl-reactions');
        const chatBtn = document.getElementById('ctrl-chat');
        const participantsBtn = document.getElementById('ctrl-participants');

        // Microphone toggle
        micBtn.addEventListener('click', async () => {
            micEnabled = !micEnabled;
            micBtn.classList.toggle('muted', !micEnabled);
            await room.localParticipant.setMicrophoneEnabled(micEnabled);
            updateVideoGrid();
        });

        // Camera toggle
        camBtn.addEventListener('click', async () => {
            camEnabled = !camEnabled;
            camBtn.classList.toggle('muted', !camEnabled);
            await room.localParticipant.setCameraEnabled(camEnabled);
            updateVideoGrid();
        });

        // Screen sharing
        screenBtn.addEventListener('click', async () => {
            try {
                const screenTrack = await livekitClient.createLocalScreenTracks({
                    audio: false,
                });
                for (const track of screenTrack) {
                    await room.localParticipant.publishTrack(track, { name: 'screen-share' });
                    screenBtn.classList.add('muted');

                    track.on('ended', () => {
                        screenBtn.classList.remove('muted');
                        updateVideoGrid();
                    });
                }
            } catch (err) {
                console.log('Screen share cancelled or failed');
            }
        });

        // Leave call
        leaveBtn.addEventListener('click', () => {
            if (room) {
                room.disconnect();
                room = null;
            }
            clearInterval(timerInterval);
            headerBar.style.display = 'none';
            controlBar.style.display = 'none';
            videoGrid.innerHTML = '';

            // Reset to lobby
            lobby.classList.add('active');
            joinNowBtn.disabled = false;
            joinNowBtn.textContent = 'Join now';
            startCameraPreview();
        });

        // Emoji reactions toggle
        const emojiPanel = document.getElementById('emoji-popup-panel');
        let panelVisible = false;

        reactionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panelVisible = !panelVisible;
            emojiPanel.classList.toggle('visible', panelVisible);
            reactionsBtn.classList.toggle('active', panelVisible);
        });

        document.addEventListener('click', (e) => {
            if (panelVisible && !emojiPanel.contains(e.target) && e.target !== reactionsBtn) {
                panelVisible = false;
                emojiPanel.classList.remove('visible');
                reactionsBtn.classList.remove('active');
            }
        });

        // Chat toggle
        chatBtn.addEventListener('click', () => toggleSidePanel('chat'));
        document.getElementById('chat-close').addEventListener('click', () => toggleSidePanel('chat'));

        // Participants toggle
        participantsBtn.addEventListener('click', () => toggleSidePanel('participants'));
        document.getElementById('participants-close').addEventListener('click', () => toggleSidePanel('participants'));
    }

    function setupScreenSharing() {
        // Already handled in setupControls
    }

    // ============================================
    // SIDE PANELS
    // ============================================
    let activePanel = null;

    function toggleSidePanel(panel) {
        const chatPanel = document.getElementById('chat-panel');
        const participantsPanel = document.getElementById('participants-panel');
        const chatBtn = document.getElementById('ctrl-chat');
        const participantsBtn = document.getElementById('ctrl-participants');

        if (activePanel === panel) {
            // Close
            chatPanel.style.display = 'none';
            participantsPanel.style.display = 'none';
            chatBtn.classList.remove('active');
            participantsBtn.classList.remove('active');
            activePanel = null;
        } else {
            // Close current, open new
            chatPanel.style.display = 'none';
            participantsPanel.style.display = 'none';
            chatBtn.classList.remove('active');
            participantsBtn.classList.remove('active');

            if (panel === 'chat') {
                chatPanel.style.display = 'flex';
                chatBtn.classList.add('active');
                document.getElementById('chat-badge').style.display = 'none';
                document.getElementById('chat-input').focus();
            } else if (panel === 'participants') {
                participantsPanel.style.display = 'flex';
                participantsBtn.classList.add('active');
                updateParticipantsList();
            }
            activePanel = panel;
        }
    }

    // ============================================
    // REACTIONS (synced via data channel)
    // ============================================
    function setupReactions() {
        const emojiButtons = document.querySelectorAll('.emoji-btn');
        const handRaiseBtn = document.getElementById('hand-raise-btn');

        emojiButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const emoji = btn.dataset.emoji;
                const name = localStorage.getItem('meet_userName') || 'You';

                // Show locally
                showFloatingEmoji(emoji);
                showNotification(`${name} reacted with ${emoji}`);

                // Send to others
                sendData({ type: 'emoji', emoji, name });

                btn.style.transform = 'scale(1.4)';
                setTimeout(() => btn.style.transform = '', 300);
            });
        });

        handRaiseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handRaised = !handRaised;
            handRaiseBtn.classList.toggle('active', handRaised);
            const name = localStorage.getItem('meet_userName') || 'You';

            showNotification(handRaised ? '✋ You raised your hand' : '✋ You lowered your hand');
            sendData({ type: 'handRaise', raised: handRaised, name });
        });
    }

    function showFloatingEmoji(emoji) {
        const container = document.getElementById('reactions-container');
        const el = document.createElement('div');
        el.className = 'floating-emoji';
        el.textContent = emoji;
        el.style.left = (20 + Math.random() * 60) + '%';
        container.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
        setTimeout(() => { if (el.parentNode) el.remove(); }, 4000);
    }

    // ============================================
    // CHAT (synced via data channel)
    // ============================================
    function setupChat() {
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send');

        function sendMessage() {
            const text = input.value.trim();
            if (!text) return;
            const name = localStorage.getItem('meet_userName') || 'You';

            addChatMessage(name, text, true);
            sendData({ type: 'chat', text, name });
            input.value = '';
        }

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    function addChatMessage(name, text, isLocal) {
        const container = document.getElementById('chat-messages');
        const msg = document.createElement('div');
        msg.className = 'chat-msg';

        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        msg.innerHTML = `
            <div class="chat-msg-author">${isLocal ? 'You' : name}</div>
            <div class="chat-msg-text">${escapeHtml(text)}</div>
            <div class="chat-msg-time">${time}</div>
        `;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;

        // Show badge if chat panel is closed
        if (activePanel !== 'chat' && !isLocal) {
            const badge = document.getElementById('chat-badge');
            const count = parseInt(badge.textContent || '0') + 1;
            badge.textContent = count;
            badge.style.display = 'flex';
        }
    }

    // ============================================
    // PARTICIPANTS LIST
    // ============================================
    function setupParticipants() {
        updateParticipantsList();
    }

    function updateParticipantsList() {
        if (!room) return;
        const container = document.getElementById('participants-list');
        container.innerHTML = '';

        const myName = localStorage.getItem('meet_userName') || 'You';
        const myID = sessionStorage.getItem('meet_userID');

        // Local participant
        const myItem = document.createElement('div');
        myItem.className = 'participant-item';
        myItem.innerHTML = `
            <div class="participant-avatar">${myName[0].toUpperCase()}</div>
            <div class="participant-name">${escapeHtml(myName)} <span class="participant-you">(You)</span></div>
        `;
        container.appendChild(myItem);

        // Remote participants
        for (const participant of room.participants.values()) {
            const name = participant.name || participant.identity;
            const item = document.createElement('div');
            item.className = 'participant-item';
            item.innerHTML = `
                <div class="participant-avatar">${name[0].toUpperCase()}</div>
                <div class="participant-name">${escapeHtml(name)}</div>
            `;
            container.appendChild(item);
        }
    }

    function updateParticipantCount() {
        if (!room) return;
        const count = room.participants.size + 1;
        document.getElementById('meeting-participant-count').textContent = count;
        document.getElementById('participant-count-badge').textContent = count;
        updateParticipantsList();
    }

    // ============================================
    // DATA CHANNEL (reactions, chat, hand raise)
    // ============================================
    function sendData(data) {
        if (!room) return;
        try {
            const payload = new TextEncoder().encode(JSON.stringify(data));
            room.localParticipant.sendData(payload, { reliable: true });
        } catch (err) {
            console.warn('[Meet] Failed to send data:', err);
        }
    }

    function handleDataMessage(data, participant) {
        const name = participant?.name || participant?.identity || 'Someone';

        switch (data.type) {
            case 'emoji':
                showFloatingEmoji(data.emoji);
                showNotification(`${data.name || name} reacted with ${data.emoji}`);
                break;

            case 'handRaise':
                showNotification(data.raised
                    ? `✋ ${data.name || name} raised their hand`
                    : `${data.name || name} lowered their hand`);
                if (data.raised) playSound('handRaise');
                break;

            case 'chat':
                addChatMessage(data.name || name, data.text, false);
                break;
        }
    }

    // ============================================
    // TIMER
    // ============================================
    function startTimer() {
        meetingStartTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        updateTimer();
    }

    function updateTimer() {
        const el = document.getElementById('meeting-timer');
        if (!el || !meetingStartTime) return;
        const elapsed = Math.floor((Date.now() - meetingStartTime) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        const pad = (n) => String(n).padStart(2, '0');
        el.textContent = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    // ============================================
    // NOTIFICATIONS
    // ============================================
    function showNotification(message) {
        const el = document.getElementById('meeting-notification');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => el.classList.remove('show'), 2500);
    }

    // ============================================
    // SOUNDS (Web Audio API)
    // ============================================
    let audioCtx = null;

    function initAudio() {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }

    function playTone(freq, dur, type, vol) {
        if (!audioCtx) initAudio();
        if (!audioCtx) return;
        try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(vol || 0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            osc.start();
            osc.stop(audioCtx.currentTime + dur);
        } catch (e) {}
    }

    function playSound(type) {
        initAudio();
        if (type === 'join') {
            playTone(523.25, 0.15);
            setTimeout(() => playTone(659.25, 0.15), 100);
            setTimeout(() => playTone(783.99, 0.2), 200);
        } else if (type === 'leave') {
            playTone(783.99, 0.15);
            setTimeout(() => playTone(659.25, 0.15), 100);
            setTimeout(() => playTone(523.25, 0.25), 200);
        } else if (type === 'handRaise') {
            playTone(880, 0.1);
            setTimeout(() => playTone(1108.73, 0.15), 80);
        }
    }

    // ============================================
    // UTILS
    // ============================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();
