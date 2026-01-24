import { createServer } from 'http';
import { randomInt, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

type RoomPhase = 'LOBBY' | 'DEAL' | 'PLACE' | 'LOCK' | 'REVEAL' | 'END';

type Card = {
  title: string;
  artist: string;
  year: number;
};

type HostState = {
  sessionToken: string;
  socketId?: string;
  connected: boolean;
};

type PlayerState = {
  id: string;
  name: string;
  sessionToken: string;
  socketId?: string;
  connected: boolean;
  timeline: Card[];
};

type RoomState = {
  code: string;
  seq: number;
  phase: RoomPhase;
  createdAt: number;
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
};

type ConnectionIndex =
  | { role: 'host'; roomCode: string }
  | { role: 'player'; roomCode: string; playerId: string };

type AckOk<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true;
} & T;

type AckErr = {
  ok: false;
  code: string;
  message: string;
};

type Ack<T extends Record<string, unknown> = Record<string, never>> = (
  response: AckOk<T> | AckErr
) => void;

type JoinPayload = {
  roomCode: string;
  name: string;
};

type ResumeHostPayload = {
  hostSessionToken: string;
};

type ResumePlayerPayload = {
  playerSessionToken: string;
};

type KickPayload = {
  playerId: string;
};

type PlacePayload = {
  placementIndex: number;
};

const ROOM_CODE_LENGTH = 6;
const TURN_DURATION_MS = 40_000;
const REVEAL_DURATION_MS = 3000;
const WIN_CARD_COUNT = 10;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDeck: Card[] = JSON.parse(
  readFileSync(resolve(__dirname, '../../cards.json'), 'utf-8')
) as Card[];

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

const rooms = new Map<string, RoomState>();
const hostSessions = new Map<string, string>();
const playerSessions = new Map<string, { roomCode: string; playerId: string }>();
const socketIndex = new Map<string, ConnectionIndex>();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

const ok = <T extends Record<string, unknown>>(data?: T): AckOk<T> =>
  ({ ok: true, ...(data ?? {}) } as AckOk<T>);

const err = (code: string, message: string): AckErr => ({
  ok: false,
  code,
  message,
});

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_CODE_ATTEMPTS = 12;

const nextRoomCode = (): string | null => {
  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  return null;
};

const shuffleCards = (cards: Card[]): Card[] => {
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
};

const ensureActivePlayer = (room: RoomState): PlayerState | null => {
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

const advanceToNextPlayer = (room: RoomState) => {
  if (room.turnOrder.length === 0) {
    return;
  }
  room.activePlayerIndex = (room.activePlayerIndex + 1) % room.turnOrder.length;
};

const isPlacementCorrect = (timeline: Card[], card: Card, index: number): boolean => {
  if (index < 0 || index > timeline.length) {
    return false;
  }
  const prev = index > 0 ? timeline[index - 1] : null;
  const next = index < timeline.length ? timeline[index] : null;
  if (prev && card.year < prev.year) {
    return false;
  }
  if (next && card.year > next.year) {
    return false;
  }
  return true;
};

const buildScores = (room: RoomState) =>
  room.players.map((player) => ({ playerId: player.id, score: player.timeline.length }));

const buildTimelines = (room: RoomState) =>
  room.players.map((player) => ({ playerId: player.id, timeline: player.timeline }));

const bumpSeq = (room: RoomState) => {
  room.seq += 1;
};

const serializeRoom = (room: RoomState) => ({
  code: room.code,
  seq: room.seq,
  phase: room.phase,
  activePlayerId: room.turnOrder[room.activePlayerIndex] ?? null,
  turnNumber: room.turnNumber,
  turnExpiresAt: room.turnExpiresAt,
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
  io.to(room.code).emit('room.snapshot', serializeRoom(room));
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

const closeRoom = (room: RoomState, reason: string) => {
  clearRoomTimers(room);
  io.to(room.code).emit('room.closed', { reason });
  hostSessions.delete(room.host.sessionToken);
  for (const player of room.players) {
    playerSessions.delete(player.sessionToken);
    disconnectSocket(player.socketId);
  }
  disconnectSocket(room.host.socketId);
  rooms.delete(room.code);
};

const endGame = (room: RoomState, payload: { winnerId?: string; reason: string }) => {
  clearRoomTimers(room);
  room.phase = 'END';
  room.currentCard = null;
  room.tentativePlacementIndex = null;
  bumpSeq(room);
  emitSnapshot(room);
  io.to(room.code).emit('game.ended', payload);
};

const seedTimelines = (room: RoomState) => {
  room.players.forEach((player) => {
    if (room.deck.length === 0) {
      return;
    }
    const card = room.deck.shift() ?? null;
    if (card) {
      player.timeline = [card];
    } else {
      player.timeline = [];
    }
  });
};

const scheduleNextTurn = (room: RoomState, delayMs: number) => {
  if (room.revealTimer) {
    clearTimeout(room.revealTimer);
  }
  room.revealTimer = setTimeout(() => {
    advanceToNextPlayer(room);
    startTurn(room);
  }, delayMs);
};

const emitTurnDealt = (room: RoomState, activePlayer: PlayerState, card: Card, expiresAt: number) => {
  io.to(room.code).emit('turn.dealt', {
    activePlayerId: activePlayer.id,
    turnNumber: room.turnNumber,
    expiresAt,
  });

  if (room.host.socketId) {
    io.to(room.host.socketId).emit('turn.dealt.host', {
      activePlayerId: activePlayer.id,
      turnNumber: room.turnNumber,
      card,
      timelines: buildTimelines(room),
    });
  }

  if (activePlayer.socketId) {
    io.to(activePlayer.socketId).emit('turn.dealt.player', {
      activePlayerId: activePlayer.id,
      turnNumber: room.turnNumber,
      timeline: activePlayer.timeline,
    });
  }
};

const resolveLock = (room: RoomState, reason: 'LOCK' | 'TIMEOUT') => {
  const activePlayer = ensureActivePlayer(room);
  if (!activePlayer || !room.currentCard || room.tentativePlacementIndex === null) {
    return;
  }

  clearRoomTimers(room);
  room.phase = 'LOCK';

  const placementIndex = room.tentativePlacementIndex;
  const card = room.currentCard;
  const correct = isPlacementCorrect(activePlayer.timeline, card, placementIndex);

  if (correct) {
    const updatedTimeline = [...activePlayer.timeline];
    updatedTimeline.splice(placementIndex, 0, card);
    activePlayer.timeline = updatedTimeline;
  }

  room.currentCard = null;
  room.tentativePlacementIndex = null;
  room.phase = 'REVEAL';

  io.to(room.code).emit('turn.reveal', {
    playerId: activePlayer.id,
    card,
    correct,
    placementIndex,
    timeline: activePlayer.timeline,
    scores: buildScores(room),
    reason,
  });

  bumpSeq(room);
  emitSnapshot(room);

  if (activePlayer.timeline.length >= WIN_CARD_COUNT) {
    endGame(room, { winnerId: activePlayer.id, reason: 'WIN' });
    return;
  }

  scheduleNextTurn(room, REVEAL_DURATION_MS);
};

const startTurn = (room: RoomState) => {
  clearRoomTimers(room);
  const activePlayer = ensureActivePlayer(room);
  if (!activePlayer) {
    endGame(room, { reason: 'NO_PLAYERS' });
    return;
  }

  if (room.deck.length === 0) {
    endGame(room, { reason: 'DECK_EMPTY' });
    return;
  }

  room.currentCard = room.deck.shift() ?? null;
  room.tentativePlacementIndex = null;
  room.phase = 'DEAL';
  room.turnNumber += 1;
  const expiresAt = Date.now() + TURN_DURATION_MS;
  room.turnExpiresAt = expiresAt;

  bumpSeq(room);
  emitSnapshot(room);
  if (room.currentCard) {
    emitTurnDealt(room, activePlayer, room.currentCard, expiresAt);
  }
  room.phase = 'PLACE';

  room.turnTimer = setTimeout(() => {
    handleTurnTimeout(room.code);
  }, TURN_DURATION_MS);
};

const handleTurnTimeout = (roomCode: string) => {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }
  if (!room.currentCard) {
    return;
  }
  const activePlayer = ensureActivePlayer(room);
  if (!activePlayer) {
    return;
  }

  if (room.tentativePlacementIndex === null) {
    room.tentativePlacementIndex = activePlayer.timeline.length;
  }

  resolveLock(room, 'TIMEOUT');
};

io.on('connection', (socket) => {
  socket.on('room.create', (_payload: unknown, ack?: Ack<{ roomCode: string; hostSessionToken: string }>) => {
    const roomCode = nextRoomCode();
    if (!roomCode) {
      ack?.(err('ROOM_CODE_EXHAUSTED', 'Unable to allocate room code.'));
      return;
    }

    const hostSessionToken = randomUUID();
    const room: RoomState = {
      code: roomCode,
      seq: 0,
      phase: 'LOBBY',
      createdAt: Date.now(),
      host: {
        sessionToken: hostSessionToken,
        socketId: socket.id,
        connected: true,
      },
      players: [],
      nextPlayerNumber: 1,
      turnOrder: [],
      activePlayerIndex: 0,
      turnNumber: 0,
      deck: [],
      currentCard: null,
      tentativePlacementIndex: null,
      turnExpiresAt: null,
      turnTimer: null,
      revealTimer: null,
    };

    rooms.set(roomCode, room);
    hostSessions.set(hostSessionToken, roomCode);
    socketIndex.set(socket.id, { role: 'host', roomCode });
    socket.join(roomCode);

    bumpSeq(room);
    emitSnapshot(room);
    ack?.(ok({ roomCode, hostSessionToken }));
  });

  socket.on('room.join', (payload: JoinPayload, ack?: Ack<{ playerId: string; playerSessionToken: string }>) => {
    const { roomCode, name } = payload ?? {};
    if (!roomCode || !name?.trim()) {
      ack?.(err('INVALID_PAYLOAD', 'roomCode and name are required.'));
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }
    if (room.phase !== 'LOBBY') {
      ack?.(err('ROOM_LOCKED', 'Game already started.'));
      return;
    }

    const userAgent = normalizeUserAgent(socket.handshake.headers['user-agent']);
    if (!isMobileUserAgent(userAgent)) {
      ack?.(err('NON_MOBILE_DEVICE', 'Please join from a phone.'));
      return;
    }

    const playerId = `P${room.nextPlayerNumber.toString().padStart(2, '0')}`;
    room.nextPlayerNumber += 1;

    const playerSessionToken = randomUUID();
    const player: PlayerState = {
      id: playerId,
      name: name.trim(),
      sessionToken: playerSessionToken,
      socketId: socket.id,
      connected: true,
      timeline: [],
    };

    room.players.push(player);
    playerSessions.set(playerSessionToken, { roomCode, playerId });
    socketIndex.set(socket.id, { role: 'player', roomCode, playerId });
    socket.join(roomCode);

    bumpSeq(room);
    emitSnapshot(room);
    ack?.(ok({ playerId, playerSessionToken }));
  });

  socket.on('host.resume', (payload: ResumeHostPayload, ack?: Ack<{ roomCode: string }>) => {
    const { hostSessionToken } = payload ?? {};
    if (!hostSessionToken) {
      ack?.(err('TOKEN_REQUIRED', 'hostSessionToken is required.'));
      return;
    }

    const roomCode = hostSessions.get(hostSessionToken);
    if (!roomCode) {
      ack?.(err('SESSION_NOT_FOUND', 'Host session not found.'));
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    if (room.host.socketId && room.host.socketId !== socket.id) {
      disconnectSocket(room.host.socketId);
    }

    room.host.socketId = socket.id;
    room.host.connected = true;
    socketIndex.set(socket.id, { role: 'host', roomCode });
    socket.join(roomCode);

    bumpSeq(room);
    emitSnapshot(room);
    if (room.phase !== 'LOBBY' && room.currentCard) {
      const activePlayer = ensureActivePlayer(room);
      if (activePlayer) {
        socket.emit('turn.dealt.host', {
          activePlayerId: activePlayer.id,
          turnNumber: room.turnNumber,
          card: room.currentCard,
          timelines: buildTimelines(room),
        });
      }
    }
    ack?.(ok({ roomCode }));
  });

  socket.on('player.resume', (payload: ResumePlayerPayload, ack?: Ack<{ roomCode: string; playerId: string }>) => {
    const { playerSessionToken } = payload ?? {};
    if (!playerSessionToken) {
      ack?.(err('TOKEN_REQUIRED', 'playerSessionToken is required.'));
      return;
    }

    const session = playerSessions.get(playerSessionToken);
    if (!session) {
      ack?.(err('SESSION_NOT_FOUND', 'Player session not found.'));
      return;
    }

    const room = rooms.get(session.roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    const player = room.players.find((entry) => entry.id === session.playerId);
    if (!player) {
      ack?.(err('PLAYER_NOT_FOUND', 'Player not found.'));
      return;
    }

    const userAgent = normalizeUserAgent(socket.handshake.headers['user-agent']);
    if (!isMobileUserAgent(userAgent)) {
      ack?.(err('NON_MOBILE_DEVICE', 'Please join from a phone.'));
      return;
    }

    if (player.socketId && player.socketId !== socket.id) {
      disconnectSocket(player.socketId);
    }

    player.socketId = socket.id;
    player.connected = true;
    socketIndex.set(socket.id, { role: 'player', roomCode: room.code, playerId: player.id });
    socket.join(room.code);

    bumpSeq(room);
    emitSnapshot(room);
    ack?.(ok({ roomCode: room.code, playerId: player.id }));
  });

  socket.on('game.start', (_payload: unknown, ack?: Ack) => {
    const connection = socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(err('FORBIDDEN', 'Only the host can start the game.'));
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    if (room.phase !== 'LOBBY') {
      ack?.(err('ROOM_LOCKED', 'Game already started.'));
      return;
    }

    if (room.players.length < 2) {
      ack?.(err('NOT_ENOUGH_PLAYERS', 'At least 2 players are required.'));
      return;
    }

    room.players.forEach((player) => {
      player.timeline = [];
    });
    room.turnOrder = room.players.map((player) => player.id);
    room.activePlayerIndex = 0;
    room.turnNumber = 0;
    room.deck = shuffleCards(baseDeck);
    room.currentCard = null;
    room.tentativePlacementIndex = null;
    room.phase = 'DEAL';

    seedTimelines(room);

    bumpSeq(room);
    emitSnapshot(room);
    io.to(room.code).emit('game.started', {
      turnOrder: room.turnOrder,
      activePlayerId: room.turnOrder[0] ?? null,
      turnNumber: room.turnNumber,
      timelines: buildTimelines(room),
    });

    startTurn(room);
    ack?.(ok());
  });

  socket.on('turn.place', (payload: PlacePayload, ack?: Ack) => {
    const connection = socketIndex.get(socket.id);
    if (!connection || connection.role !== 'player') {
      ack?.(err('FORBIDDEN', 'Only players can place cards.'));
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    if (room.phase !== 'PLACE') {
      ack?.(err('INVALID_PHASE', 'Not accepting placements right now.'));
      return;
    }

    const activePlayer = ensureActivePlayer(room);
    if (!activePlayer) {
      ack?.(err('PLAYER_NOT_FOUND', 'Active player not found.'));
      return;
    }

    if (activePlayer.id !== connection.playerId) {
      ack?.(err('NOT_ACTIVE_PLAYER', 'Only the active player can place.'));
      return;
    }

    const { placementIndex } = payload ?? {};
    if (
      typeof placementIndex !== 'number' ||
      placementIndex < 0 ||
      placementIndex > activePlayer.timeline.length
    ) {
      ack?.(err('INVALID_PLACEMENT', 'Invalid placement index.'));
      return;
    }

    room.tentativePlacementIndex = placementIndex;
    bumpSeq(room);
    emitSnapshot(room);
    io.to(room.code).emit('turn.placed', {
      playerId: activePlayer.id,
      placementIndex,
    });
    ack?.(ok());
  });

  socket.on('turn.remove', (_payload: unknown, ack?: Ack) => {
    const connection = socketIndex.get(socket.id);
    if (!connection || connection.role !== 'player') {
      ack?.(err('FORBIDDEN', 'Only players can remove placements.'));
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    if (room.phase !== 'PLACE') {
      ack?.(err('INVALID_PHASE', 'Not accepting removals right now.'));
      return;
    }

    const activePlayer = ensureActivePlayer(room);
    if (!activePlayer) {
      ack?.(err('PLAYER_NOT_FOUND', 'Active player not found.'));
      return;
    }

    if (activePlayer.id !== connection.playerId) {
      ack?.(err('NOT_ACTIVE_PLAYER', 'Only the active player can remove.'));
      return;
    }

    if (room.tentativePlacementIndex === null) {
      ack?.(ok());
      return;
    }

    room.tentativePlacementIndex = null;
    bumpSeq(room);
    emitSnapshot(room);
    io.to(room.code).emit('turn.removed', {
      playerId: activePlayer.id,
    });
    ack?.(ok());
  });

  const handleReveal = (ack?: Ack) => {
    const connection = socketIndex.get(socket.id);
    if (!connection || connection.role !== 'player') {
      ack?.(err('FORBIDDEN', 'Only players can reveal.'));
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    if (room.phase !== 'PLACE') {
      ack?.(err('INVALID_PHASE', 'Not accepting reveals right now.'));
      return;
    }

    const activePlayer = ensureActivePlayer(room);
    if (!activePlayer) {
      ack?.(err('PLAYER_NOT_FOUND', 'Active player not found.'));
      return;
    }

    if (activePlayer.id !== connection.playerId) {
      ack?.(err('NOT_ACTIVE_PLAYER', 'Only the active player can reveal.'));
      return;
    }

    if (room.tentativePlacementIndex === null) {
      ack?.(err('NO_PLACEMENT', 'Place the card before revealing.'));
      return;
    }

    resolveLock(room, 'LOCK');
    ack?.(ok());
  };

  socket.on('turn.lock', (_payload: unknown, ack?: Ack) => {
    handleReveal(ack);
  });

  socket.on('turn.reveal', (_payload: unknown, ack?: Ack) => {
    handleReveal(ack);
  });

  socket.on('kickPlayer', (payload: KickPayload, ack?: Ack<{ playerId: string }>) => {
    const connection = socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(err('FORBIDDEN', 'Only the host can kick players.'));
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    const { playerId } = payload ?? {};
    if (!playerId) {
      ack?.(err('INVALID_PAYLOAD', 'playerId is required.'));
      return;
    }

    const playerIndex = room.players.findIndex((entry) => entry.id === playerId);
    if (playerIndex === -1) {
      ack?.(err('PLAYER_NOT_FOUND', 'Player not found.'));
      return;
    }

    const [removedPlayer] = room.players.splice(playerIndex, 1);
    playerSessions.delete(removedPlayer.sessionToken);
    if (removedPlayer.socketId) {
      io.to(removedPlayer.socketId).emit('player.kicked', { playerId: removedPlayer.id });
    }

    bumpSeq(room);
    emitSnapshot(room);
    disconnectSocket(removedPlayer.socketId);
    ack?.(ok({ playerId: removedPlayer.id }));
  });

  socket.on('room.leave', (_payload: unknown, ack?: Ack) => {
    const connection = socketIndex.get(socket.id);
    if (!connection) {
      ack?.(err('NOT_IN_ROOM', 'Socket is not in a room.'));
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      socketIndex.delete(socket.id);
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    if (connection.role === 'host') {
      closeRoom(room, 'HOST_LEFT');
      ack?.(ok());
      return;
    }

    if (room.phase !== 'LOBBY') {
      ack?.(err('ROOM_LOCKED', 'Cannot leave after the game has started.'));
      return;
    }

    const playerIndex = room.players.findIndex((entry) => entry.id === connection.playerId);
    if (playerIndex === -1) {
      socketIndex.delete(socket.id);
      ack?.(err('PLAYER_NOT_FOUND', 'Player not found.'));
      return;
    }

    const [player] = room.players.splice(playerIndex, 1);
    playerSessions.delete(player.sessionToken);
    socketIndex.delete(socket.id);
    socket.leave(room.code);

    bumpSeq(room);
    emitSnapshot(room);
    ack?.(ok());
  });

  socket.on('room.delete', (_payload: unknown, ack?: Ack) => {
    const connection = socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(err('FORBIDDEN', 'Only the host can delete the room.'));
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      ack?.(err('ROOM_NOT_FOUND', 'Room not found.'));
      return;
    }

    if (room.phase !== 'LOBBY') {
      ack?.(err('ROOM_LOCKED', 'Cannot delete after the game has started.'));
      return;
    }

    closeRoom(room, 'HOST_DELETED');
    ack?.(ok());
  });

  socket.on('disconnect', () => {
    const connection = socketIndex.get(socket.id);
    if (!connection) {
      return;
    }

    const room = rooms.get(connection.roomCode);
    if (!room) {
      socketIndex.delete(socket.id);
      return;
    }

    if (connection.role === 'host') {
      room.host.connected = false;
      room.host.socketId = undefined;
    } else {
      const player = room.players.find((entry) => entry.id === connection.playerId);
      if (player) {
        player.connected = false;
        player.socketId = undefined;
      }
    }

    socketIndex.delete(socket.id);
    bumpSeq(room);
    emitSnapshot(room);
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`Socket.IO server listening on http://localhost:${port}`);
});
