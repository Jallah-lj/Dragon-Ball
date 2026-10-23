import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@dbfc/shared';

export type RaceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
let socket: RaceSocket | null = null;

/** Lazily created Socket.IO connection (authenticated by the session cookie). */
export function getSocket(): RaceSocket {
  if (!socket) {
    const opts = {
      path: '/socket.io',
      withCredentials: true,
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    };
    socket = (BASE ? io(BASE, opts) : io(opts)) as RaceSocket;
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

export function connectSocket(): Promise<RaceSocket> {
  const s = getSocket();
  if (s.connected) return Promise.resolve(s);
  return new Promise((resolve, reject) => {
    const onConnect = () => {
      cleanup();
      resolve(s);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      s.off('connect', onConnect);
      s.off('connect_error', onError);
    };
    s.on('connect', onConnect);
    s.on('connect_error', onError);
    s.connect();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * NTP-style clock sync: returns the offset to add to Date.now() to obtain
 * server time, using the lowest-latency half of several samples.
 */
export async function measureClockOffset(
  s: RaceSocket,
  samples = 7,
): Promise<{ offset: number; rtt: number }> {
  const results: { offset: number; rtt: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    try {
      const serverTime = await s.timeout(2000).emitWithAck('clock:ping', t0);
      const t1 = Date.now();
      const rtt = t1 - t0;
      results.push({ rtt, offset: serverTime - (t0 + rtt / 2) });
    } catch {
      // Timed out — skip the sample.
    }
    await sleep(40);
  }
  if (results.length === 0) return { offset: 0, rtt: 0 };
  results.sort((a, b) => a.rtt - b.rtt);
  const best = results.slice(0, Math.max(1, Math.ceil(results.length / 2)));
  const offsets = best.map((r) => r.offset).sort((a, b) => a - b);
  return { offset: offsets[Math.floor(offsets.length / 2)]!, rtt: best[0]!.rtt };
}
