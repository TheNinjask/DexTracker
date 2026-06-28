// Peer-to-peer savefile sync (PC <-> phone) over WebRTC.
//
// GitHub Pages is static-only, so there's no server we own. We use PeerJS's free
// public broker for *connection setup only* (it sees a random peer-id, nothing
// else); the savefile itself streams device-to-device over an encrypted WebRTC
// data channel and is never stored on any relay.
//
// peerjs is heavy and only needed when the user actually syncs, so it's loaded
// on demand via dynamic import — it never bloats the initial PWA bundle.
//
// The connection setup is asymmetric (one device hosts a peer id and shows the
// QR/link; the other joins it) but the data channel is bidirectional, so either
// device can be the one that sends the savefile. The host decides the direction
// and encodes it in the link, so the opener automatically does the opposite.

async function makePeer() {
  const mod = await import('peerjs');
  const Peer = mod.default || mod.Peer;
  return new Peer();
}

// Drive one transfer over an open-able connection. role 'send' pushes `payload`
// and waits for the ack; role 'receive' waits for the data, hands it to onData,
// then acks. onComplete tears the peer down once the exchange finishes.
function runTransfer(conn, role, { payload, onStatus, onData, onComplete }) {
  if (role === 'send') {
    conn.on('open', () => { conn.send(payload); onStatus('sending'); });
    conn.on('data', (msg) => { if (String(msg) === 'ack') { onStatus('done'); onComplete(); } });
  } else {
    conn.on('open', () => onStatus('connected'));
    conn.on('data', (data) => {
      onData(String(data));
      try { conn.send('ack'); } catch {}
      onStatus('done');
      onComplete();
    });
  }
  conn.on('error', (e) => onStatus('error', e));
}

// Host: opens a peer, hands its id back so the UI can render a QR/link, then
// runs the chosen `role` once the other side joins. Returns a controller
// immediately, even though the peer comes up async.
export function startHost(role, { payload, onPeerId, onStatus, onData }) {
  let peer = null, closed = false;
  (async () => {
    try { peer = await makePeer(); }
    catch (e) { onStatus('error', e); return; }
    if (closed) { peer.destroy(); return; }
    peer.on('open', (id) => { onPeerId(id); onStatus('waiting'); });
    peer.on('connection', (conn) => {
      onStatus('connected');
      runTransfer(conn, role, { payload, onStatus, onData, onComplete: () => setTimeout(() => { if (peer) peer.destroy(); }, 600) });
    });
    peer.on('error', (e) => onStatus('error', e));
  })();
  return { close() { closed = true; if (peer) peer.destroy(); } };
}

// Joiner (the device opening the QR/link): connects to `hostId` and runs the
// chosen `role` — the opposite of whatever the host is doing.
export function startJoin(hostId, role, { payload, onStatus, onData }) {
  let peer = null, closed = false;
  (async () => {
    try { peer = await makePeer(); }
    catch (e) { onStatus('error', e); return; }
    if (closed) { peer.destroy(); return; }
    peer.on('open', () => {
      onStatus('connecting');
      const conn = peer.connect(hostId, { reliable: true });
      runTransfer(conn, role, { payload, onStatus, onData, onComplete: () => setTimeout(() => { if (peer) peer.destroy(); }, 800) });
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

// Parse a sync link/hash. `#sync=<peerId>` carries the host's peer id; `act`
// names what the OPENING device should do — 'recv' (default; host is sending)
// or 'send' (host is receiving). Returns { id, role } or null.
export function parseSyncId() {
  const hash = location.hash || '';
  const m = hash.match(/sync=([^&]+)/);
  if (!m) return null;
  const am = hash.match(/act=([^&]+)/);
  const role = am && am[1] === 'send' ? 'send' : 'receive';
  return { id: decodeURIComponent(m[1]), role };
}
