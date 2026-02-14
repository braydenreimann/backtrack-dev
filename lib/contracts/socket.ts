import type { Card, RoomSnapshot, TimelineByPlayer, TurnReveal } from './game.js';

export const CLIENT_TO_SERVER_EVENTS = {
  ROOM_CREATE: 'room.create',
  ROOM_JOIN: 'room.join',
  HOST_RESUME: 'host.resume',
  PLAYER_RESUME: 'player.resume',
  ROOM_LEAVE: 'room.leave',
  ROOM_DELETE: 'room.delete',
  GAME_START: 'game.start',
  GAME_TERMINATE: 'game.terminate',
  GAME_PAUSE: 'client:game.pause',
  GAME_RESUME: 'client:game.resume',
  TURN_PLACE: 'turn.place',
  TURN_REMOVE: 'turn.remove',
  TURN_REVEAL: 'turn.reveal',
  TURN_LOCK: 'turn.lock',
  PLAYER_KICK: 'kickPlayer',
} as const;

export const SERVER_TO_CLIENT_EVENTS = {
  ROOM_SNAPSHOT: 'room.snapshot',
  ROOM_CLOSED: 'room.closed',
  GAME_STARTED: 'game.started',
  GAME_ENDED: 'game.ended',
  GAME_TERMINATED: 'game.terminated',
  TURN_DEALT: 'turn.dealt',
  TURN_DEALT_HOST: 'turn.dealt.host',
  TURN_DEALT_PLAYER: 'turn.dealt.player',
  TURN_PLACED: 'turn.placed',
  TURN_REMOVED: 'turn.removed',
  TURN_REVEAL: 'turn.reveal',
  PLAYER_KICKED: 'player.kicked',
} as const;

export type ClientToServerEvent =
  (typeof CLIENT_TO_SERVER_EVENTS)[keyof typeof CLIENT_TO_SERVER_EVENTS];
export type ServerToClientEvent =
  (typeof SERVER_TO_CLIENT_EVENTS)[keyof typeof SERVER_TO_CLIENT_EVENTS];

export const ACK_ERROR_CODES = {
  ALREADY_PAUSED: 'ALREADY_PAUSED',
  FORBIDDEN: 'FORBIDDEN',
  GAME_PAUSED: 'GAME_PAUSED',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  INVALID_PHASE: 'INVALID_PHASE',
  INVALID_PLACEMENT: 'INVALID_PLACEMENT',
  NON_MOBILE_DEVICE: 'NON_MOBILE_DEVICE',
  NOT_ACTIVE_PLAYER: 'NOT_ACTIVE_PLAYER',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  NOT_PAUSED: 'NOT_PAUSED',
  NO_PLACEMENT: 'NO_PLACEMENT',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  ROOM_CODE_EXHAUSTED: 'ROOM_CODE_EXHAUSTED',
  ROOM_LOCKED: 'ROOM_LOCKED',
  ROOM_MISMATCH: 'ROOM_MISMATCH',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_TERMINATED: 'ROOM_TERMINATED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  TOKEN_REQUIRED: 'TOKEN_REQUIRED',
  KICKED: 'KICKED',
} as const;

export type AckErrorCode = (typeof ACK_ERROR_CODES)[keyof typeof ACK_ERROR_CODES];

export type AckOk<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true;
} & T;

export type AckErr = {
  ok: false;
  code: AckErrorCode;
  message: string;
};

export type AckResponse<T extends Record<string, unknown> = Record<string, never>> =
  | AckOk<T>
  | AckErr;

export type AckHandler<T extends Record<string, unknown> = Record<string, never>> = (
  response: AckResponse<T>
) => void;

export type RoomCreateRequest = Record<string, never>;
export type RoomJoinRequest = { roomCode: string; name: string };
export type HostResumeRequest = { hostSessionToken: string };
export type PlayerResumeRequest = { playerSessionToken: string };
export type RoomLeaveRequest = Record<string, never>;
export type RoomDeleteRequest = Record<string, never>;
export type GameStartRequest = Record<string, never>;
export type GameTerminateRequest = { reason?: string };
export type GamePauseRequest = { roomCode: string };
export type GameResumeRequest = { roomCode: string };
export type TurnPlaceRequest = { placementIndex: number };
export type TurnRemoveRequest = Record<string, never>;
export type TurnRevealRequest = Record<string, never>;
export type TurnLockRequest = Record<string, never>;
export type KickPlayerRequest = { playerId: string };

export type RoomCreateAck = { roomCode: string; hostSessionToken: string };
export type RoomJoinAck = { playerId: string; playerSessionToken: string };
export type HostResumeAck = { roomCode: string };
export type PlayerResumeAck = { roomCode: string; playerId: string };
export type KickPlayerAck = { playerId: string };

export type GameTerminationPayload = {
  roomCode: string;
  reason: string;
  terminatedAt: number;
};

export type GameEndedPayload = {
  winnerId?: string;
  reason: string;
};

export type GameStartedPayload = {
  turnOrder: string[];
  activePlayerId: string | null;
  turnNumber: number;
  timelines: TimelineByPlayer;
};

export type RoomClosedPayload = {
  reason: string;
};

export type TurnDealtPayload = {
  activePlayerId: string;
  turnNumber: number;
  expiresAt: number;
};

export type TurnDealtHostPayload = {
  activePlayerId: string;
  turnNumber: number;
  card: Card;
  timelines: TimelineByPlayer;
};

export type TurnDealtPlayerPayload = {
  activePlayerId: string;
  turnNumber: number;
  timeline: Card[];
};

export type TurnPlacedPayload = {
  playerId: string;
  placementIndex: number;
};

export type TurnRemovedPayload = {
  playerId: string;
};

export type PlayerKickedPayload = {
  playerId: string;
};

export type RoomSnapshotPayload = RoomSnapshot;
export type TurnRevealPayload = TurnReveal;
