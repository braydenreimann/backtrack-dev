type RoomPhase = 'LOBBY' | 'DEAL' | 'PLACE' | 'LOCK' | 'REVEAL' | 'END';

type Card = {
  title: string;
  artist: string;
  year: number;
};

type RoomPlayer = {
  id: string;
  name: string;
  connected: boolean;
  cardCount: number;
};

type HostRoomSnapshot = {
  code: string;
  seq: number;
  phase: RoomPhase;
  activePlayerId: string | null;
  turnNumber: number;
  turnExpiresAt: number | null;
  host: { connected: boolean };
  players: RoomPlayer[];
};

type PlayRoomSnapshot = {
  code: string;
  seq: number;
  phase: RoomPhase;
  activePlayerId: string | null;
  turnNumber: number;
  host: { connected: boolean };
  turnExpiresAt: number | null;
  players: Array<{ id: string; name: string; connected: boolean; cardCount: number }>;
};

type TurnReveal = {
  playerId: string;
  card: Card;
  correct: boolean;
  placementIndex: number;
  timeline: Card[];
  reason: string;
};

type PreviewState = 'idle' | 'loading' | 'ready' | 'blocked' | 'unavailable';

export type MockHostLobbyState = {
  room: HostRoomSnapshot;
  status: string;
  error: string | null;
};

export type MockHostGameState = {
  room: HostRoomSnapshot;
  status: string;
  error: string | null;
  activePlayerId: string | null;
  turnExpiresAt: number | null;
  timelines: Record<string, Card[]>;
  currentCard: Card | null;
  tentativePlacementIndex: number | null;
  reveal: TurnReveal | null;
  previewState: PreviewState;
  previewUrl: string | null;
  isPlaying: boolean;
};

export type MockPlayRoomState = {
  room: PlayRoomSnapshot;
  status: string;
  error: string | null;
  activePlayerId: string | null;
  turnExpiresAt: number | null;
  playerId: string;
  playerName: string;
  timeline: Card[];
  placementIndex: number | null;
  reveal: TurnReveal | null;
};

export const mockRoomCode = 'ABC123';
export const mockPlayerId = 'p1';
export const mockPlayerName = 'Avery';

const basePlayers: RoomPlayer[] = [
  { id: mockPlayerId, name: mockPlayerName, connected: true, cardCount: 3 },
  { id: 'p2', name: 'Blake', connected: true, cardCount: 2 },
  { id: 'p3', name: 'Casey', connected: false, cardCount: 4 },
];

const baseHostRoom: HostRoomSnapshot = {
  code: mockRoomCode,
  seq: 12,
  phase: 'LOBBY',
  activePlayerId: null,
  turnNumber: 1,
  turnExpiresAt: null,
  host: { connected: true },
  players: basePlayers,
};

const basePlayRoom: PlayRoomSnapshot = {
  code: mockRoomCode,
  seq: 12,
  phase: 'LOBBY',
  activePlayerId: null,
  turnNumber: 1,
  host: { connected: true },
  turnExpiresAt: null,
  players: basePlayers,
};

const timelineA: Card[] = [
  { title: 'Billie Jean', artist: 'Michael Jackson', year: 1982 },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991 },
  { title: 'Crazy in Love', artist: 'Beyonce', year: 2003 },
];

const timelineB: Card[] = [
  { title: 'Like a Virgin', artist: 'Madonna', year: 1984 },
  { title: 'Wonderwall', artist: 'Oasis', year: 1995 },
  { title: 'Hey Ya!', artist: 'Outkast', year: 2003 },
];

const timelineC: Card[] = [
  { title: 'Purple Rain', artist: 'Prince', year: 1984 },
  { title: 'No Scrubs', artist: 'TLC', year: 1999 },
  { title: 'Hips Dont Lie', artist: 'Shakira', year: 2005 },
];

const timelineFull: Card[] = [
  { title: 'Like a Virgin', artist: 'Madonna', year: 1984 },
  { title: 'Wonderwall', artist: 'Oasis', year: 1995 },
  { title: 'No Scrubs', artist: 'TLC', year: 1999 },
  { title: 'Lose Yourself', artist: 'Eminem', year: 2002 },
  { title: 'Hey Ya!', artist: 'Outkast', year: 2003 },
  { title: 'Crazy in Love', artist: 'Beyonce', year: 2003 },
  { title: 'Hips Dont Lie', artist: 'Shakira', year: 2005 },
  { title: 'Bad Romance', artist: 'Lady Gaga', year: 2009 },
  { title: 'Rolling in the Deep', artist: 'Adele', year: 2010 },
  { title: 'Royals', artist: 'Lorde', year: 2013 },
];

const mockCurrentCard: Card = {
  title: 'Lose Yourself',
  artist: 'Eminem',
  year: 2002,
};

const clonePlayers = (players: RoomPlayer[]) => players.map((player) => ({ ...player }));
const cloneCards = (cards: Card[]) => cards.map((card) => ({ ...card }));

const normalizeState = (state: string | null) => (state ?? '').trim().toLowerCase();

export const getMockHostLobbyState = (state: string | null): MockHostLobbyState => {
  const key = normalizeState(state);
  if (key === 'empty') {
    return {
      room: { ...baseHostRoom, players: [], seq: baseHostRoom.seq + 1 },
      status: 'Lobby connected.',
      error: null,
    };
  }
  if (key === 'error') {
    return {
      room: { ...baseHostRoom, players: clonePlayers(basePlayers) },
      status: 'Lobby connected.',
      error: 'Mock error: unable to reach server.',
    };
  }
  return {
    room: { ...baseHostRoom, players: clonePlayers(basePlayers) },
    status: 'Lobby connected.',
    error: null,
  };
};

export const getMockHostGameState = (state: string | null): MockHostGameState => {
  const key = normalizeState(state);
  const now = Date.now();
  const turnExpiresAt = now + 28_000;
  const room: HostRoomSnapshot = {
    ...baseHostRoom,
    phase: 'PLACE',
    activePlayerId: 'p2',
    turnNumber: 5,
    turnExpiresAt,
    players: clonePlayers(basePlayers),
  };

  const timelines = {
    [mockPlayerId]: cloneCards(timelineA),
    p2: cloneCards(timelineB),
    p3: cloneCards(timelineC),
  };

  const baseState: MockHostGameState = {
    room,
    status: '',
    error: null,
    activePlayerId: 'p2',
    turnExpiresAt,
    timelines,
    currentCard: { ...mockCurrentCard },
    tentativePlacementIndex: 1,
    reveal: null,
    previewState: 'blocked',
    previewUrl: null,
    isPlaying: false,
  };

  if (key === 'waiting') {
    return {
      ...baseState,
      room: { ...room, phase: 'DEAL', activePlayerId: null, turnExpiresAt: null },
      activePlayerId: null,
      turnExpiresAt: null,
      timelines: {},
      currentCard: null,
      tentativePlacementIndex: null,
      status: 'Waiting for players...',
      previewState: 'idle',
    };
  }

  if (key === 'reveal') {
    const revealTimeline = [
      { ...timelineB[0] },
      { ...mockCurrentCard },
      { ...timelineB[1] },
      { ...timelineB[2] },
    ];
    return {
      ...baseState,
      room: { ...room, phase: 'REVEAL' },
      reveal: {
        playerId: 'p2',
        card: { ...mockCurrentCard },
        correct: true,
        placementIndex: 1,
        timeline: revealTimeline,
        reason: 'mock',
      },
      previewState: 'ready',
      previewUrl: 'mock',
    };
  }

  if (key === 'full') {
    return {
      ...baseState,
      timelines: {
        ...baseState.timelines,
        p2: cloneCards(timelineFull),
      },
    };
  }

  return baseState;
};

export const getMockPlayRoomState = (state: string | null): MockPlayRoomState => {
  const key = normalizeState(state);
  const now = Date.now();
  const turnExpiresAt = now + 24_000;
  const timelineOne = [timelineA[0]];
  const timelineFive = timelineFull.slice(0, 5);
  const buildPlayPlayers = (cardCount: number) =>
    clonePlayers(basePlayers).map((player) =>
      player.id === mockPlayerId ? { ...player, cardCount } : player
    );
  const room: PlayRoomSnapshot = {
    ...basePlayRoom,
    phase: 'PLACE',
    activePlayerId: mockPlayerId,
    turnExpiresAt,
    players: buildPlayPlayers(timelineA.length),
  };

  const baseState: MockPlayRoomState = {
    room,
    status: 'Your turn! Place the mystery card.',
    error: null,
    activePlayerId: mockPlayerId,
    turnExpiresAt,
    playerId: mockPlayerId,
    playerName: mockPlayerName,
    timeline: cloneCards(timelineA),
    placementIndex: 1,
    reveal: null,
  };

  if (key === 'watch') {
    return {
      ...baseState,
      room: { ...room, activePlayerId: 'p2', phase: 'PLACE' },
      activePlayerId: 'p2',
      placementIndex: null,
      status: 'Watching the host screen.',
    };
  }

  if (key === 'active-one') {
    return {
      ...baseState,
      room: { ...room, players: buildPlayPlayers(timelineOne.length) },
      timeline: cloneCards(timelineOne),
      placementIndex: null,
    };
  }

  if (key === 'active-five') {
    return {
      ...baseState,
      room: { ...room, players: buildPlayPlayers(timelineFive.length) },
      timeline: cloneCards(timelineFive),
      placementIndex: null,
    };
  }

  if (key === 'active-full') {
    return {
      ...baseState,
      room: { ...room, players: buildPlayPlayers(timelineFull.length) },
      timeline: cloneCards(timelineFull),
      placementIndex: null,
    };
  }

  if (key === 'reveal') {
    const revealTimeline = [
      { ...timelineA[0] },
      { ...mockCurrentCard },
      { ...timelineA[1] },
      { ...timelineA[2] },
    ];
    return {
      ...baseState,
      room: { ...room, phase: 'REVEAL', players: buildPlayPlayers(revealTimeline.length) },
      reveal: {
        playerId: mockPlayerId,
        card: { ...mockCurrentCard },
        correct: false,
        placementIndex: 1,
        timeline: revealTimeline,
        reason: 'mock',
      },
      placementIndex: null,
      status: 'Reveal in progress.',
    };
  }

  return baseState;
};
