import type { Socket } from 'socket.io';
import type { Telemetry } from '../observability/telemetry.js';
import type { Card, RoomPhase } from '../../../lib/contracts/game.js';
import type {
  AckErrorCode,
  AckErr,
  AckHandler,
  AckOk,
  GamePauseRequest,
  GameResumeRequest,
  GameStartRequest,
  GameTerminateRequest,
  HostResumeAck,
  HostResumeRequest,
  KickPlayerAck,
  KickPlayerRequest,
  PlayerResumeAck,
  PlayerResumeRequest,
  RoomCreateAck,
  RoomCreateRequest,
  RoomDeleteRequest,
  RoomJoinAck,
  RoomJoinRequest,
  RoomLeaveRequest,
  TurnLockRequest,
  TurnPlaceRequest,
  TurnRemoveRequest,
  TurnRevealRequest,
} from '../../../lib/contracts/socket.js';

export type HostState = {
  sessionToken: string;
  socketId?: string;
  connected: boolean;
};

export type PlayerState = {
  id: string;
  name: string;
  sessionToken: string;
  socketId?: string;
  connected: boolean;
  timeline: Card[];
};

export type RoomState = {
  code: string;
  seq: number;
  phase: RoomPhase;
  createdAt: number;
  terminatedAt: number | null;
  terminationReason: string | null;
  host: HostState;
  players: PlayerState[];
  nextPlayerNumber: number;
  turnOrder: string[];
  activePlayerIndex: number;
  turnNumber: number;
  deck: Card[];
  currentCard: Card | null;
  tentativePlacementIndex: number | null;
  turnExpiresAt: number | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  revealTimer: ReturnType<typeof setTimeout> | null;
  revealExpiresAt: number | null;
  isPaused: boolean;
  pausedTurnRemainingMs: number | null;
  pausedRevealRemainingMs: number | null;
};

export type ConnectionIndex =
  | { role: 'host'; roomCode: string }
  | { role: 'player'; roomCode: string; playerId: string };

export type TerminationRecord = {
  roomCode: string;
  reason: string;
  terminatedAt: number;
  expiresAt: number;
};

export type Ack<T extends Record<string, unknown> = Record<string, never>> = AckHandler<T>;

export type EngineCoreRuntime = {
  rooms: Map<string, RoomState>;
  hostSessions: Map<string, string>;
  playerSessions: Map<string, { roomCode: string; playerId: string }>;
  socketIndex: Map<string, ConnectionIndex>;
  ok: <T extends Record<string, unknown>>(data?: T) => AckOk<T>;
  err: (code: AckErrorCode, message: string) => AckErr;
  normalizeUserAgent: (userAgent: string | string[] | undefined) => string;
  isMobileUserAgent: (userAgent: string) => boolean;
  nextRoomCode: () => string | null;
  shuffleCards: (cards: ReadonlyArray<Card>) => Card[];
  getTerminationRecordByRoom: (roomCode: string) => TerminationRecord | null;
  getTerminationRecordBySession: (sessionToken: string) => TerminationRecord | null;
  formatTerminationMessage: (record: TerminationRecord) => string;
  clearRoomTimers: (room: RoomState) => void;
  resetPauseState: (room: RoomState) => void;
  ensureActivePlayer: (room: RoomState) => PlayerState | null;
  buildScores: (room: RoomState) => Array<{ playerId: string; score: number }>;
  buildTimelines: (room: RoomState) => Array<{ playerId: string; timeline: Card[] }>;
  bumpSeq: (room: RoomState) => void;
  emitSnapshot: (room: RoomState) => void;
  disconnectSocket: (socketId?: string) => void;
  closeRoom: (room: RoomState, reason: string) => void;
  terminateRoom: (room: RoomState, reason: string) => void;
  recordAction: Telemetry['recordAction'];
  recordTransition: (
    room: RoomState,
    action: string,
    details?: Record<string, unknown>
  ) => void;
};

export type TurnRuntime = {
  pauseRoom: (room: RoomState) => void;
  resumeRoom: (room: RoomState) => void;
  seedTimelines: (room: RoomState) => void;
  startTurn: (room: RoomState) => void;
  resolveLock: (room: RoomState, reason: 'LOCK' | 'TIMEOUT') => void;
};

export type EngineCommandApi = {
  commandRoomCreate: (socket: Socket, payload: RoomCreateRequest, ack?: Ack<RoomCreateAck>) => void;
  commandRoomJoin: (socket: Socket, payload: RoomJoinRequest, ack?: Ack<RoomJoinAck>) => void;
  commandHostResume: (socket: Socket, payload: HostResumeRequest, ack?: Ack<HostResumeAck>) => void;
  commandPlayerResume: (socket: Socket, payload: PlayerResumeRequest, ack?: Ack<PlayerResumeAck>) => void;
  commandGameStart: (socket: Socket, payload: GameStartRequest, ack?: Ack) => void;
  commandGamePause: (socket: Socket, payload: GamePauseRequest, ack?: Ack) => void;
  commandGameResume: (socket: Socket, payload: GameResumeRequest, ack?: Ack) => void;
  commandGameTerminate: (socket: Socket, payload: GameTerminateRequest, ack?: Ack) => void;
  commandTurnPlace: (socket: Socket, payload: TurnPlaceRequest, ack?: Ack) => void;
  commandTurnRemove: (socket: Socket, payload: TurnRemoveRequest, ack?: Ack) => void;
  commandTurnLock: (socket: Socket, payload: TurnLockRequest, ack?: Ack) => void;
  commandTurnReveal: (socket: Socket, payload: TurnRevealRequest, ack?: Ack) => void;
  commandKickPlayer: (socket: Socket, payload: KickPlayerRequest, ack?: Ack<KickPlayerAck>) => void;
  commandRoomLeave: (socket: Socket, payload: RoomLeaveRequest, ack?: Ack) => void;
  commandRoomDelete: (socket: Socket, payload: RoomDeleteRequest, ack?: Ack) => void;
  commandDisconnect: (socket: Socket) => void;
};

export type GameEngine = Omit<EngineCoreRuntime, 'clearRoomTimers' | 'buildScores'> &
  Pick<TurnRuntime, 'pauseRoom' | 'resumeRoom' | 'seedTimelines' | 'startTurn' | 'resolveLock'> &
  EngineCommandApi & {
    baseDeck: Card[];
  };
