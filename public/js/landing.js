/**
 * Landing Page Logic
 * New meeting → generates room code → navigates to lobby
 * Join by code → navigates to lobby with that code
 */

(function () {
    'use strict';

    const newMeetingBtn = document.getElementById('new-meeting-btn');
    const meetingCodeInput = document.getElementById('meeting-code-input');
    const joinBtn = document.getElementById('join-btn');

    // Generate a readable room ID like "meet-abc-def-123"
    function generateRoomID() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const segment = (len) => {
            let s = '';
            for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
            return s;
        };
        return `meet-${segment(3)}-${segment(3)}-${segment(2)}`;
    }

    // Navigate to meeting room
    function goToMeeting(roomID, role) {
        sessionStorage.setItem('meet_roomID', roomID);
        sessionStorage.setItem('meet_role', role || 'Host');

        document.getElementById('landing-page').classList.remove('active');
        document.getElementById('meeting-page').classList.add('active');
        document.getElementById('lobby-room-id').textContent = roomID;

        // Pre-fill name if saved
        const savedName = localStorage.getItem('meet_userName');
        if (savedName) {
            document.getElementById('lobby-name').value = savedName;
        }

        // Trigger lobby initialization
        if (typeof window.initLobby === 'function') {
            window.initLobby();
        }
    }

    // New Meeting button
    newMeetingBtn.addEventListener('click', () => {
        const roomID = generateRoomID();
        goToMeeting(roomID, 'Host');
    });

    // Join by code
    meetingCodeInput.addEventListener('input', () => {
        const val = meetingCodeInput.value.trim();
        joinBtn.disabled = val.length === 0;
    });

    joinBtn.addEventListener('click', () => {
        let code = meetingCodeInput.value.trim();
        if (!code) return;

        // If it's a full URL, extract the room param
        if (code.includes('http')) {
            try {
                const url = new URL(code);
                code = url.searchParams.get('room') || code;
            } catch (e) {
                // Not a valid URL, use as-is
            }
        }

        goToMeeting(code, 'Host');
    });

    meetingCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !joinBtn.disabled) joinBtn.click();
    });

    // Handle direct link (e.g. ?room=meet-abc-def)
    (function checkDirectJoin() {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room') || params.get('roomID');
        const role = params.get('role') || 'Host';

        if (room) {
            goToMeeting(room, role);
        }
    })();

})();
