import { randomInt } from 'crypto';
import type { Server } from 'socket.io';
import { SERVER_TO_CLIENT_EVENTS, type AckErrorCode, type AckErr, type AckOk } from '../../../lib/contracts/socket.js';
import type { Card } from '../../../lib/contracts/game.js';
import type { Telemetry } from '../observability/telemetry.js';
import type { ConnectionIndex, EngineCoreRuntime, RoomState, TerminationRecord } from './types.js';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARS = '0123456789';
const ROOM_CODE_ATTEMPTS = 12;
const TERMINATION_TTL_MS = 10 * 60 * 1000;

export const createCoreRuntime = (
  io: Server,
  options?: {
    onRoomTeardown?: (roomCode: string) => void;
    telemetry?: Telemetry;
  }
): EngineCoreRuntime => {
  const rooms = new Map<string, RoomState>();
  const hostSessions = new Map<string, string>();
  const playerSessions = new Map<string, { roomCode: string; playerId: string }>();
  const socketIndex = new Map<string, ConnectionIndex>();
  const terminatedRooms = new Map<string, TerminationRecord>();
  const terminatedSessions = new Map<string, TerminationRecord>();

  const ok = <T extends Record<string, unknown>>(data?: T): AckOk<T> =>
    ({ ok: true, ...(data ?? {}) } as AckOk<T>);

  const err = (code: AckErrorCode, message: string): AckErr => ({
    ok: false,
    code,
    message,
  });

  const normalizeUserAgent = (userAgent: string | string[] | undefined): string => {
    if (!userAgent) {
      return '';
    }
    return Array.isArray(userAgent) ? userAgent.join(' ') : userAgent;
  };

  const isMobileUserAgent = (userAgent: string): boolean => {
    const isIPhone = /iPhone/i.test(userAgent) || /iPod/i.test(userAgent);
    const isAndroidPhone = /Android/i.test(userAgent) && /Mobile/i.test(userAgent);
    const hasMobi = /Mobi/i.test(userAgent);
    return isIPhone || isAndroidPhone || hasMobi;
  };

  const buildTerminationRecord = (
    roomCode: string,
    reason: string,
    terminatedAt: number
  ): TerminationRecord => ({
    roomCode,
    reason,
    terminatedAt,
    expiresAt: terminatedAt + TERMINATION_TTL_MS,
  });

  const getTerminationRecordByRoom = (roomCode: string): TerminationRecord | null => {
    const record = terminatedRooms.get(roomCode);
    if (!record) {
      return null;
    }
    if (record.expiresAt <= Date.now()) {
      terminatedRooms.delete(roomCode);
      return null;
    }
    return record;
  };

  const getTerminationRecordBySession = (sessionToken: string): TerminationRecord | null => {
    const record = terminatedSessions.get(sessionToken);
    if (!record) {
      return null;
    }
    if (record.expiresAt <= Date.now()) {
      terminatedSessions.delete(sessionToken);
      return null;
    }
    return record;
  };

  const rememberTermination = (room: RoomState, reason: string, terminatedAt: number) => {
    const record = buildTerminationRecord(room.code, reason, terminatedAt);
    terminatedRooms.set(room.code, record);
    const sessionTokens = [room.host.sessionToken, ...room.players.map((player) => player.sessionToken)];
    sessionTokens.forEach((token) => terminatedSessions.set(token, record));
    setTimeout(() => {
      const existing = terminatedRooms.get(room.code);
      if (existing && existing.terminatedAt === terminatedAt) {
        terminatedRooms.delete(room.code);
      }
      sessionTokens.forEach((token) => {
        const sessionRecord = terminatedSessions.get(token);
        if (sessionRecord && sessionRecord.terminatedAt === terminatedAt) {
          terminatedSessions.delete(token);
        }
      });
    }, TERMINATION_TTL_MS);
  };

  const nextRoomCode = (): string | null => {
    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
        code += ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)];
      }
      if (!rooms.has(code) && !getTerminationRecordByRoom(code)) {
        return code;
      }
    }
    return null;
  };

  const shuffleCards = (cards: ReadonlyArray<Card>): Card[] => {
    const deck = [...cards];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  };

  const clearRoomTimers = (room: RoomState) => {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
    }
    if (room.revealTimer) {
      clearTimeout(room.revealTimer);
    }
    room.turnTimer = null;
    room.revealTimer = null;
    room.turnExpiresAt = null;
    room.revealExpiresAt = null;
  };

  const resetPauseState = (room: RoomState) => {
    room.isPaused = false;
    room.pausedTurnRemainingMs = null;
    room.pausedRevealRemainingMs = null;
  };

  const bumpSeq = (room: RoomState) => {
    room.seq += 1;
  };

  const recordAction: Telemetry['recordAction'] = (action, details) => {
    options?.telemetry?.recordAction(action, details);
  };

  const recordTransition = (
    room: RoomState,
    action: string,
    details?: Record<string, unknown>
  ) => {
    options?.telemetry?.recordTransition(action, room, details);
  };

  const serializeRoom = (room: RoomState) => ({
    code: room.code,
    seq: room.seq,
    phase: room.phase,
    activePlayerId: room.turnOrder[room.activePlayerIndex] ?? null,
    turnNumber: room.turnNumber,
    turnExpiresAt: room.turnExpiresAt,
    isPaused: room.isPaused,
    pausedTurnRemainingMs: room.isPaused ? room.pausedTurnRemainingMs : null,
    host: {
      connected: room.host.connected,
    },
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      cardCount: player.timeline.length,
    })),
  });

  const emitSnapshot = (room: RoomState) => {
    io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.ROOM_SNAPSHOT, serializeRoom(room));
  };

  const ensureActivePlayer = (room: RoomState) => {
    if (room.turnOrder.length === 0) {
      return null;
    }
    for (let offset = 0; offset < room.turnOrder.length; offset += 1) {
      const index = (room.activePlayerIndex + offset) % room.turnOrder.length;
      const playerId = room.turnOrder[index];
      const player = room.players.find((entry) => entry.id === playerId);
      if (player) {
        room.activePlayerIndex = index;
        return player;
      }
    }
    return null;
  };

  const buildScores = (room: RoomState) =>
    room.players.map((player) => ({ playerId: player.id, score: player.timeline.length }));

  const buildTimelines = (room: RoomState) =>
    room.players.map((player) => ({ playerId: player.id, timeline: player.timeline }));

  const formatTerminationMessage = (record: TerminationRecord) => {
    if (record.reason === 'HOST_ENDED') {
      return 'Game ended by the host.';
    }
    return `Room ended (${record.reason}).`;
  };

  const disconnectSocket = (socketId?: string) => {
    if (!socketId) {
      return;
    }
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect(true);
    }
    socketIndex.delete(socketId);
  };

  const teardownRoom = (room: RoomState, reason: string, emitClosed: boolean) => {
    clearRoomTimers(room);
    if (emitClosed) {
      io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.ROOM_CLOSED, { reason });
    }
    hostSessions.delete(room.host.sessionToken);
    for (const player of room.players) {
      playerSessions.delete(player.sessionToken);
      disconnectSocket(player.socketId);
    }
    disconnectSocket(room.host.socketId);
    rooms.delete(room.code);
    recordAction('ROOM_TEARDOWN', {
      roomCode: room.code,
      reason,
      emitClosed,
    });
    options?.onRoomTeardown?.(room.code);
  };

  const closeRoom = (room: RoomState, reason: string) => {
    recordTransition(room, 'ROOM_CLOSE', { reason });
    teardownRoom(room, reason, true);
  };

  const terminateRoom = (room: RoomState, reason: string) => {
    if (room.terminatedAt) {
      return;
    }
    const terminatedAt = Date.now();
    room.terminatedAt = terminatedAt;
    room.terminationReason = reason;
    clearRoomTimers(room);
    resetPauseState(room);
    room.phase = 'END';
    room.currentCard = null;
    room.tentativePlacementIndex = null;
    room.turnExpiresAt = null;
    bumpSeq(room);
    recordTransition(room, 'ROOM_TERMINATE', { reason, terminatedAt });
    emitSnapshot(room);
    io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.GAME_TERMINATED, {
      roomCode: room.code,
      reason,
      terminatedAt,
    });
    rememberTermination(room, reason, terminatedAt);
    setTimeout(() => {
      const existing = rooms.get(room.code);
      if (existing && existing.terminatedAt === terminatedAt) {
        teardownRoom(existing, reason, false);
      }
    }, 100);
  };

  return {
    rooms,
    hostSessions,
    playerSessions,
    socketIndex,
    ok,
    err,
    normalizeUserAgent,
    isMobileUserAgent,
    nextRoomCode,
    shuffleCards,
    getTerminationRecordByRoom,
    getTerminationRecordBySession,
    formatTerminationMessage,
    clearRoomTimers,
    resetPauseState,
    ensureActivePlayer,
    buildScores,
    buildTimelines,
    bumpSeq,
    emitSnapshot,
    disconnectSocket,
    closeRoom,
    terminateRoom,
    recordAction,
    recordTransition,
  };
};
