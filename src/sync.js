// Peer-to-peer savefile sync (PC <-> phone) over WebRTC.
//
// GitHub Pages is static-only, so there's no server we own. We use PeerJS's free
// public broker for *connection setup only* (it sees a random peer-id, nothing
// else); the savefile itself streams device-to-device over an encrypted WebRTC
// data channel and is never stored on any relay.
//
// peerjs is heavy and only needed when the user actually syncs, so it's loaded
// on demand via dynamic import — it never bloats the initial PWA bundle.

// Sender (the device that has the savefile). Opens a peer, hands its id back so
// the UI can render a QR/link, then pushes `payload` once the other side joins.
// Returns a controller immediately, even though the peer comes up async.
export function startSend(payload, { onPeerId, onStatus }) {
  let peer = null, closed = false;
  (async () => {
    let Peer;
    try { const mod = await import('peerjs'); Peer = mod.default || mod.Peer; }
    catch (e) { onStatus('error', e); return; }
    if (closed) return;
    peer = new Peer();
    peer.on('open', (id) => { onPeerId(id); onStatus('waiting'); });
    peer.on('connection', (conn) => {
      onStatus('connected');
      conn.on('open', () => { conn.send(payload); onStatus('sending'); });
      conn.on('data', (msg) => {
        if (msg === 'ack') { onStatus('done'); setTimeout(() => { if (peer) peer.destroy(); }, 600); }
      });
      conn.on('error', (e) => onStatus('error', e));
    });
    peer.on('error', (e) => onStatus('error', e));
  })();
  return { close() { closed = true; if (peer) peer.destroy(); } };
}

// Receiver (the device opening the QR/link). Connects to `senderId`, waits for
// the savefile, acks it, then tears down. `onData` gets the raw JSON string.
export function startReceive(senderId, { onStatus, onData }) {
  let peer = null, closed = false;
  (async () => {
    let Peer;
    try { const mod = await import('peerjs'); Peer = mod.default || mod.Peer; }
    catch (e) { onStatus('error', e); return; }
    if (closed) return;
    peer = new Peer();
    peer.on('open', () => {
      onStatus('connecting');
      const conn = peer.connect(senderId, { reliable: true });
      conn.on('open', () => onStatus('connected'));
      conn.on('data', (data) => {
        onData(String(data));
        try { conn.send('ack'); } catch {}
        onStatus('done');
        setTimeout(() => { if (peer) peer.destroy(); }, 800);
      });
      conn.on('error', (e) => onStatus('error', e));
    });
    peer.on('error', (e) => onStatus('error', e));
  })();
  return { close() { closed = true; if (peer) peer.destroy(); } };
}

// Human-readable status text shared by both dialogs.
export const STATUS_TEXT = {
  waiting: 'Waiting for the other device to connect…',
  connecting: 'Connecting…',
  connected: 'Connected — transferring…',
  sending: 'Sending savefile…',
  done: 'Done ✓',
  error: 'Connection error — check both devices are online and try again.',
};

// `#sync=<peerId>` in the URL means "receive a save from this peer".
export function parseSyncId() {
  const m = (location.hash || '').match(/sync=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
