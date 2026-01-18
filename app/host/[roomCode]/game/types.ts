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
  faceDown: boolean;
  highlight?: 'good' | 'bad';
  isCurrent: boolean;
};
