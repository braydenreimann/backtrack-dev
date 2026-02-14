// @vitest-environment node

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import type { RoomSnapshot } from '@/lib/contracts/game';
import {
  ACK_ERROR_CODES,
  CLIENT_TO_SERVER_EVENTS,
  SERVER_TO_CLIENT_EVENTS,
  type AckResponse,
  type GameTerminationPayload,
  type HostResumeAck,
  type PlayerKickedPayload,
  type PlayerResumeAck,
  type RoomCreateAck,
  type RoomJoinAck,
  type TurnDealtHostPayload,
  type TurnDealtPayload,
  type TurnDealtPlayerPayload,
  type TurnRevealPayload,
} from '@/lib/contracts/socket';

type AckOk = Exclude<AckResponse, { ok: false }>;

const TEST_TIMEOUT_MS = 15_000;
const ACK_TIMEOUT_MS = 4_000;
const EVENT_TIMEOUT_MS = 6_000;
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const TEST_TURN_DURATION_MS = '600';
const TEST_REVEAL_DURATION_MS = '120';

let startServer: (port?: number) => Promise<number>;
let stopServer: () => Promise<void>;
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

const waitForEvent = async <T>(
  socket: Socket,
  event: string,
  timeoutMs: number = EVENT_TIMEOUT_MS
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event: ${event}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.on(event, handler);
  });

const waitForEventMatching = async <T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs: number = EVENT_TIMEOUT_MS
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for matching event: ${event}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.on(event, handler);
  });

const waitForNoEvent = async (socket: Socket, event: string, durationMs: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, durationMs);

    const handler = () => {
      clearTimeout(timer);
      socket.off(event, handler);
      reject(new Error(`Unexpected event received: ${event}`));
    };

    socket.on(event, handler);
  });

const expectOk = (response: AckResponse): AckOk => {
  expect(response.ok).toBe(true);
  if (!response.ok) {
    throw new Error(`Expected ok ack but got error: ${response.code} (${response.message})`);
  }
  return response;
};

beforeAll(async () => {
  process.env.BACKTRACK_TURN_DURATION_MS = TEST_TURN_DURATION_MS;
  process.env.BACKTRACK_REVEAL_DURATION_MS = TEST_REVEAL_DURATION_MS;
  process.env.BACKTRACK_TELEMETRY = '0';

  const serverModule = await import('./server');
  startServer = serverModule.startServer;
  stopServer = serverModule.stopServer;

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
  delete process.env.BACKTRACK_TURN_DURATION_MS;
  delete process.env.BACKTRACK_REVEAL_DURATION_MS;
  delete process.env.BACKTRACK_TELEMETRY;
}, TEST_TIMEOUT_MS);

describe('server socket integration flows', () => {
  it(
    'allows a host and player to complete one place-and-reveal turn',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(
        await emitWithAck<AckResponse<RoomCreateAck>>(host, CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {})
      );
      const roomCode = createAck.roomCode;

      const player = await connectClient(true);
      const joinAck = expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(player, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'Casey',
        })
      );
      const playerId = joinAck.playerId;

      const dealtPromise = waitForEvent<TurnDealtPlayerPayload>(
        player,
        SERVER_TO_CLIENT_EVENTS.TURN_DEALT_PLAYER
      );

      expectOk(await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_START, {}));
      const dealt = await dealtPromise;

      expect(dealt.activePlayerId).toBe(playerId);
      expect(dealt.turnNumber).toBe(1);
      expect(Array.isArray(dealt.timeline)).toBe(true);

      expectOk(await emitWithAck(player, CLIENT_TO_SERVER_EVENTS.TURN_PLACE, { placementIndex: 1 }));

      const revealPromise = waitForEvent<TurnRevealPayload>(player, SERVER_TO_CLIENT_EVENTS.TURN_REVEAL);
      expectOk(await emitWithAck(player, CLIENT_TO_SERVER_EVENTS.TURN_REVEAL, {}));
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
      const createAck = expectOk(
        await emitWithAck<AckResponse<RoomCreateAck>>(host, CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {})
      );
      const roomCode = createAck.roomCode;

      const player = await connectClient(true);
      expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(player, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'Alex',
        })
      );

      const pauseAck = await emitWithAck<AckResponse>(
        player,
        CLIENT_TO_SERVER_EVENTS.GAME_PAUSE,
        { roomCode }
      );
      expect(pauseAck.ok).toBe(false);
      if (!pauseAck.ok) {
        expect(pauseAck.code).toBe(ACK_ERROR_CODES.FORBIDDEN);
      }
    },
    TEST_TIMEOUT_MS
  );

  it(
    'supports player reconnect mid-turn with player.resume',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(
        await emitWithAck<AckResponse<RoomCreateAck>>(host, CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {})
      );
      const roomCode = createAck.roomCode;

      const player = await connectClient(true);
      const joinAck = expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(player, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'Jordan',
        })
      );

      const initialTurn = waitForEvent<TurnDealtPlayerPayload>(
        player,
        SERVER_TO_CLIENT_EVENTS.TURN_DEALT_PLAYER
      );
      expectOk(await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_START, {}));
      const dealtBeforeDisconnect = await initialTurn;

      player.disconnect();

      const resumedPlayer = await connectClient(true);
      const resumedTurn = waitForEvent<TurnDealtPlayerPayload>(
        resumedPlayer,
        SERVER_TO_CLIENT_EVENTS.TURN_DEALT_PLAYER
      );
      const resumeAck = expectOk(
        await emitWithAck<AckResponse<PlayerResumeAck>>(resumedPlayer, CLIENT_TO_SERVER_EVENTS.PLAYER_RESUME, {
          playerSessionToken: joinAck.playerSessionToken,
        })
      );

      const dealtAfterResume = await resumedTurn;
      expect(resumeAck.playerId).toBe(joinAck.playerId);
      expect(dealtAfterResume.turnNumber).toBe(dealtBeforeDisconnect.turnNumber);
      expect(dealtAfterResume.activePlayerId).toBe(joinAck.playerId);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'supports host disconnect and host.resume during an active turn',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(
        await emitWithAck<AckResponse<RoomCreateAck>>(host, CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {})
      );
      const roomCode = createAck.roomCode;

      const player = await connectClient(true);
      expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(player, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'Taylor',
        })
      );

      const initialHostTurn = waitForEvent<TurnDealtHostPayload>(
        host,
        SERVER_TO_CLIENT_EVENTS.TURN_DEALT_HOST
      );
      expectOk(await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_START, {}));
      const dealtBeforeDisconnect = await initialHostTurn;

      host.disconnect();

      const resumedHost = await connectClient(false);
      const resumedTurn = waitForEvent<TurnDealtHostPayload>(
        resumedHost,
        SERVER_TO_CLIENT_EVENTS.TURN_DEALT_HOST
      );
      const resumeAck = expectOk(
        await emitWithAck<AckResponse<HostResumeAck>>(resumedHost, CLIENT_TO_SERVER_EVENTS.HOST_RESUME, {
          hostSessionToken: createAck.hostSessionToken,
        })
      );

      const dealtAfterResume = await resumedTurn;
      expect(resumeAck.roomCode).toBe(roomCode);
      expect(dealtAfterResume.turnNumber).toBe(dealtBeforeDisconnect.turnNumber);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'auto-locks with TIMEOUT when active player does not reveal',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(
        await emitWithAck<AckResponse<RoomCreateAck>>(host, CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {})
      );
      const roomCode = createAck.roomCode;

      const player = await connectClient(true);
      const joinAck = expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(player, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'Riley',
        })
      );

      const revealPromise = waitForEventMatching<TurnRevealPayload>(
        player,
        SERVER_TO_CLIENT_EVENTS.TURN_REVEAL,
        (payload) => payload.reason === 'TIMEOUT'
      );
      expectOk(await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_START, {}));
      const reveal = await revealPromise;

      expect(reveal.playerId).toBe(joinAck.playerId);
      expect(reveal.reason).toBe('TIMEOUT');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'preserves timer continuity across pause and resume',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(
        await emitWithAck<AckResponse<RoomCreateAck>>(host, CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {})
      );
      const roomCode = createAck.roomCode;

      const player = await connectClient(true);
      expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(player, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'Morgan',
        })
      );

      const dealtPromise = waitForEvent<TurnDealtPayload>(host, SERVER_TO_CLIENT_EVENTS.TURN_DEALT);
      expectOk(await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_START, {}));
      await dealtPromise;

      await new Promise((resolve) => setTimeout(resolve, 150));

      const pausedSnapshotPromise = waitForEventMatching<RoomSnapshot>(
        host,
        SERVER_TO_CLIENT_EVENTS.ROOM_SNAPSHOT,
        (snapshot) => snapshot.isPaused
      );
      expectOk(await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_PAUSE, { roomCode }));
      const pausedSnapshot = await pausedSnapshotPromise;
      expect(pausedSnapshot.isPaused).toBe(true);
      expect(pausedSnapshot.pausedTurnRemainingMs).not.toBeNull();

      const pauseWindowMs = Math.max(300, (pausedSnapshot.pausedTurnRemainingMs ?? 0) + 180);
      await waitForNoEvent(player, SERVER_TO_CLIENT_EVENTS.TURN_REVEAL, pauseWindowMs);

      const revealAfterResume = waitForEventMatching<TurnRevealPayload>(
        player,
        SERVER_TO_CLIENT_EVENTS.TURN_REVEAL,
        (payload) => payload.reason === 'TIMEOUT'
      );
      expectOk(await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_RESUME, { roomCode }));
      const reveal = await revealAfterResume;

      expect(reveal.reason).toBe('TIMEOUT');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'keeps active turn state valid when kicking the active player',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(
        await emitWithAck<AckResponse<RoomCreateAck>>(host, CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {})
      );
      const roomCode = createAck.roomCode;

      const playerOne = await connectClient(true);
      const joinOne = expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(playerOne, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'One',
        })
      );

      const playerTwo = await connectClient(true);
      const joinTwo = expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(playerTwo, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'Two',
        })
      );

      const dealt = waitForEvent<TurnDealtPayload>(host, SERVER_TO_CLIENT_EVENTS.TURN_DEALT);
      expectOk(await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_START, {}));
      const activePlayerId = (await dealt).activePlayerId;
      const activeSocket = activePlayerId === joinOne.playerId ? playerOne : playerTwo;

      const kickedPromise = waitForEvent<PlayerKickedPayload>(
        activeSocket,
        SERVER_TO_CLIENT_EVENTS.PLAYER_KICKED
      );
      const normalizedSnapshotPromise = waitForEventMatching<RoomSnapshot>(
        host,
        SERVER_TO_CLIENT_EVENTS.ROOM_SNAPSHOT,
        (snapshot) =>
          snapshot.players.every((player) => player.id !== activePlayerId) &&
          snapshot.players.length === 1 &&
          snapshot.activePlayerId !== activePlayerId
      );
      const kickAck = expectOk(
        await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.PLAYER_KICK, { playerId: activePlayerId })
      );
      const kickedPayload = await kickedPromise;
      const normalizedSnapshot = await normalizedSnapshotPromise;

      expect(kickAck.playerId).toBe(activePlayerId);
      expect(kickedPayload.playerId).toBe(activePlayerId);

      expect(normalizedSnapshot.players).toHaveLength(1);
      expect(
        normalizedSnapshot.activePlayerId === null ||
          normalizedSnapshot.players.some((player) => player.id === normalizedSnapshot.activePlayerId)
      ).toBe(true);
      expect([joinOne.playerId, joinTwo.playerId]).toContain(activePlayerId);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'propagates game termination and preserves terminated-session errors for resumes',
    async () => {
      const host = await connectClient(false);
      const createAck = expectOk(
        await emitWithAck<AckResponse<RoomCreateAck>>(host, CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {})
      );
      const roomCode = createAck.roomCode;

      const player = await connectClient(true);
      const joinAck = expectOk(
        await emitWithAck<AckResponse<RoomJoinAck>>(player, CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, {
          roomCode,
          name: 'Sky',
        })
      );

      const hostTerminated = waitForEvent<GameTerminationPayload>(
        host,
        SERVER_TO_CLIENT_EVENTS.GAME_TERMINATED
      );
      const playerTerminated = waitForEvent<GameTerminationPayload>(
        player,
        SERVER_TO_CLIENT_EVENTS.GAME_TERMINATED
      );

      expectOk(
        await emitWithAck(host, CLIENT_TO_SERVER_EVENTS.GAME_TERMINATE, {
          reason: 'HOST_ENDED',
        })
      );

      const hostPayload = await hostTerminated;
      const playerPayload = await playerTerminated;
      expect(hostPayload.roomCode).toBe(roomCode);
      expect(playerPayload.roomCode).toBe(roomCode);
      expect(hostPayload.reason).toBe('HOST_ENDED');
      expect(playerPayload.reason).toBe('HOST_ENDED');

      const resumedPlayer = await connectClient(true);
      const resumeAck = await emitWithAck<AckResponse<PlayerResumeAck>>(
        resumedPlayer,
        CLIENT_TO_SERVER_EVENTS.PLAYER_RESUME,
        { playerSessionToken: joinAck.playerSessionToken }
      );

      expect(resumeAck.ok).toBe(false);
      if (!resumeAck.ok) {
        expect(resumeAck.code).toBe(ACK_ERROR_CODES.ROOM_TERMINATED);
      }
    },
    TEST_TIMEOUT_MS
  );
});
