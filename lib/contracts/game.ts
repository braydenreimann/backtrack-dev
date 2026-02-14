export type RoomPhase = 'LOBBY' | 'DEAL' | 'PLACE' | 'LOCK' | 'REVEAL' | 'END';

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
  phase: RoomPhase;
  activePlayerId: string | null;
  turnNumber: number;
  turnExpiresAt: number | null;
  isPaused: boolean;
  pausedTurnRemainingMs: number | null;
  host: { connected: boolean };
  players: RoomPlayer[];
};

export type TimelineByPlayer = Array<{ playerId: string; timeline: Card[] }>;

export type ScoreByPlayer = Array<{ playerId: string; score: number }>;

export type TurnRevealReason = 'LOCK' | 'TIMEOUT' | string;

export type TurnReveal = {
  playerId: string;
  card: Card;
  correct: boolean;
  placementIndex: number;
  timeline: Card[];
  scores: ScoreByPlayer;
  reason: TurnRevealReason;
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
