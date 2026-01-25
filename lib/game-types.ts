export type Card = {
  title: string;
  artist: string;
  year: number;
};

export type RoomPlayer = {
  id: string;
  name: string;
  connected: boolean;
  cardCount: number;
};

export type RoomSnapshot = {
  code: string;
  seq: number;
  phase: string;
  activePlayerId: string | null;
  turnNumber: number;
  turnExpiresAt: number | null;
  isPaused: boolean;
  pausedTurnRemainingMs: number | null;
  host: { connected: boolean };
  players: RoomPlayer[];
};

export type TurnReveal = {
  playerId: string;
  card: Card;
  correct: boolean;
  placementIndex: number;
  timeline: Card[];
  reason: string;
};

export type TimelineItem = {
  key: string;
  card: Card | null;
  slotIndex: number;
  faceDown: boolean;
  isExiting: boolean;
  highlight?: 'good' | 'bad';
  isCurrent: boolean;
};

export const GAME_TERMINATED_EVENT = 'game.terminated';
export const GAME_TERMINATE_EVENT = 'game.terminate';
export const GAME_PAUSE_EVENT = 'client:game.pause';
export const GAME_RESUME_EVENT = 'client:game.resume';

export type GameTerminationPayload = {
  roomCode: string;
  reason: string;
  terminatedAt: number;
};

export type GamePausePayload = {
  roomCode: string;
};

export type GameResumePayload = {
  roomCode: string;
};
