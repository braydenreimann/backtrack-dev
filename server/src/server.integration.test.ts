// @vitest-environment node

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { GAME_PAUSE_EVENT } from '@/lib/game-types';
import { startServer, stopServer } from './server';

type AckOk = {
  ok: true;
  [key: string]: unknown;
};

type AckErr = {
  ok: false;
  code: string;
  message: string;
};

type AckResponse = AckOk | AckErr;

const TEST_TIMEOUT_MS = 10_000;
const ACK_TIMEOUT_MS = 3_000;
const EVENT_TIMEOUT_MS = 4_000;
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

let baseUrl = '';
const connectedSockets: Socket[] = [];

const connectClient = async (mobile: boolean): Promise<Socket> => {
  const socket = createClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: mobile ? { 'user-agent': MOBILE_USER_AGENT } : undefined,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out while connecting socket.'));
    }, EVENT_TIMEOUT_MS);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  connectedSockets.push(socket);
  return socket;
};

const emitWithAck = async <T extends AckResponse>(
  socket: Socket,
  event: string,
  payload: unknown
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack: ${event}`));
    }, ACK_TIMEOUT_MS);

    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });

const waitForEvent = async <T>(socket: Socket, event: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event: ${event}`));
    }, EVENT_TIMEOUT_MS);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const expectOk = (response: AckResponse): AckOk => {
  expect(response.ok).toBe(true);
  if (!response.ok) {
    throw new Error(`Expected ok ack but got error: ${response.code} (${response.message})`);
  }
  return response;
};

beforeAll(async () => {
  const port = await startServer(0);
  baseUrl = `http://127.0.0.1:${port}`;
}, TEST_TIMEOUT_MS);

afterEach(() => {
  for (const socket of connectedSockets.splice(0)) {
    if (socket.connected) {
      socket.disconnect();
    }
  }
});

afterAll(async () => {
  await stopServer();
}, TEST_TIMEOUT_MS);

describe('server socket integration flows', () => {
  it(
    'allows a host and player to complete one place-and-reveal turn',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(await emitWithAck(host, 'room.create', {}));
      const roomCode = createAck.roomCode as string;

      const player = await connectClient(true);
      const joinAck = expectOk(await emitWithAck(player, 'room.join', { roomCode, name: 'Casey' }));
      const playerId = joinAck.playerId as string;

      const dealtPromise = waitForEvent<{ activePlayerId: string; turnNumber: number; timeline: unknown[] }>(
        player,
        'turn.dealt.player'
      );

      expectOk(await emitWithAck(host, 'game.start', {}));
      const dealt = await dealtPromise;

      expect(dealt.activePlayerId).toBe(playerId);
      expect(dealt.turnNumber).toBe(1);
      expect(Array.isArray(dealt.timeline)).toBe(true);

      expectOk(await emitWithAck(player, 'turn.place', { placementIndex: 1 }));

      const revealPromise = waitForEvent<{ playerId: string; reason: string; correct: boolean }>(
        player,
        'turn.reveal'
      );
      expectOk(await emitWithAck(player, 'turn.reveal', {}));
      const reveal = await revealPromise;

      expect(reveal.playerId).toBe(playerId);
      expect(reveal.reason).toBe('LOCK');
      expect(typeof reveal.correct).toBe('boolean');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'rejects pause requests from non-host clients',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(await emitWithAck(host, 'room.create', {}));
      const roomCode = createAck.roomCode as string;

      const player = await connectClient(true);
      expectOk(await emitWithAck(player, 'room.join', { roomCode, name: 'Alex' }));

      const pauseAck = await emitWithAck<AckResponse>(player, GAME_PAUSE_EVENT, { roomCode });
      expect(pauseAck.ok).toBe(false);
      if (!pauseAck.ok) {
        expect(pauseAck.code).toBe('FORBIDDEN');
      }
    },
    TEST_TIMEOUT_MS
  );
});
