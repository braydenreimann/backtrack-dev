import { randomUUID } from 'crypto';
import type { Server, Socket } from 'socket.io';
import type { Card } from '../../../lib/contracts/game.js';
import { ACK_ERROR_CODES, SERVER_TO_CLIENT_EVENTS } from '../../../lib/contracts/socket.js';
import type {
  EngineCommandApi,
  EngineCoreRuntime,
  TurnRuntime,
  Ack,
  RoomState,
} from './types.js';

export const createCommandApi = (
  io: Server,
  core: EngineCoreRuntime,
  turns: TurnRuntime,
  baseDeck: ReadonlyArray<Card>
): EngineCommandApi => {
  const removePlayerFromTurnState = (
    room: RoomState,
    playerId: string
  ): { removedTurnIndex: number; removedWasActive: boolean } => {
    const removedTurnIndex = room.turnOrder.indexOf(playerId);
    if (removedTurnIndex === -1) {
      return { removedTurnIndex: -1, removedWasActive: false };
    }

    const removedWasActive = removedTurnIndex === room.activePlayerIndex;
    room.turnOrder = room.turnOrder.filter((entry) => entry !== playerId);

    if (room.turnOrder.length === 0) {
      room.activePlayerIndex = 0;
      return { removedTurnIndex, removedWasActive };
    }

    if (removedTurnIndex < room.activePlayerIndex) {
      room.activePlayerIndex -= 1;
    }
    if (room.activePlayerIndex >= room.turnOrder.length) {
      room.activePlayerIndex = 0;
    }

    return { removedTurnIndex, removedWasActive };
  };

  const commandRoomCreate: EngineCommandApi['commandRoomCreate'] = (_socket, _payload, ack) => {
    const socket = _socket;
    const roomCode = core.nextRoomCode();
    if (!roomCode) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_CODE_EXHAUSTED, 'Unable to allocate room code.'));
      return;
    }

    const hostSessionToken = randomUUID();
    const room: RoomState = {
      code: roomCode,
      seq: 0,
      phase: 'LOBBY',
      createdAt: Date.now(),
      terminatedAt: null,
      terminationReason: null,
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
      revealExpiresAt: null,
      isPaused: false,
      pausedTurnRemainingMs: null,
      pausedRevealRemainingMs: null,
    };

    core.rooms.set(roomCode, room);
    core.hostSessions.set(hostSessionToken, roomCode);
    core.socketIndex.set(socket.id, { role: 'host', roomCode });
    socket.join(roomCode);

    core.bumpSeq(room);
    core.recordTransition(room, 'ROOM_CREATE');
    core.emitSnapshot(room);
    ack?.(core.ok({ roomCode, hostSessionToken }));
  };

  const commandRoomJoin: EngineCommandApi['commandRoomJoin'] = (socket, payload, ack) => {
    const { roomCode, name } = payload ?? {};
    if (!roomCode || !name?.trim()) {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PAYLOAD, 'roomCode and name are required.'));
      return;
    }

    const termination = core.getTerminationRecordByRoom(roomCode);
    if (termination) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, core.formatTerminationMessage(termination)));
      return;
    }

    const room = core.rooms.get(roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }
    if (room.phase !== 'LOBBY') {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_LOCKED, 'Game already started.'));
      return;
    }

    const userAgent = core.normalizeUserAgent(socket.handshake.headers['user-agent']);
    if (!core.isMobileUserAgent(userAgent)) {
      ack?.(core.err(ACK_ERROR_CODES.NON_MOBILE_DEVICE, 'Please join from a phone.'));
      return;
    }

    const playerId = `P${room.nextPlayerNumber.toString().padStart(2, '0')}`;
    room.nextPlayerNumber += 1;

    const playerSessionToken = randomUUID();
    const player = {
      id: playerId,
      name: name.trim(),
      sessionToken: playerSessionToken,
      socketId: socket.id,
      connected: true,
      timeline: [],
    };

    room.players.push(player);
    core.playerSessions.set(playerSessionToken, { roomCode, playerId });
    core.socketIndex.set(socket.id, { role: 'player', roomCode, playerId });
    socket.join(roomCode);

    core.bumpSeq(room);
    core.recordTransition(room, 'ROOM_JOIN', { playerId: player.id });
    core.emitSnapshot(room);
    ack?.(core.ok({ playerId, playerSessionToken }));
  };

  const commandHostResume: EngineCommandApi['commandHostResume'] = (socket, payload, ack) => {
    const { hostSessionToken } = payload ?? {};
    if (!hostSessionToken) {
      ack?.(core.err(ACK_ERROR_CODES.TOKEN_REQUIRED, 'hostSessionToken is required.'));
      return;
    }

    const terminated = core.getTerminationRecordBySession(hostSessionToken);
    if (terminated) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, core.formatTerminationMessage(terminated)));
      return;
    }

    const roomCode = core.hostSessions.get(hostSessionToken);
    if (!roomCode) {
      ack?.(core.err(ACK_ERROR_CODES.SESSION_NOT_FOUND, 'Host session not found.'));
      return;
    }

    const room = core.rooms.get(roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }

    if (room.host.socketId && room.host.socketId !== socket.id) {
      core.disconnectSocket(room.host.socketId);
    }

    room.host.socketId = socket.id;
    room.host.connected = true;
    core.socketIndex.set(socket.id, { role: 'host', roomCode });
    socket.join(roomCode);

    core.bumpSeq(room);
    core.recordTransition(room, 'HOST_RESUME');
    core.emitSnapshot(room);
    if (room.phase !== 'LOBBY' && room.currentCard) {
      const activePlayer = core.ensureActivePlayer(room);
      if (activePlayer) {
        socket.emit(SERVER_TO_CLIENT_EVENTS.TURN_DEALT_HOST, {
          activePlayerId: activePlayer.id,
          turnNumber: room.turnNumber,
          card: room.currentCard,
          timelines: core.buildTimelines(room),
        });
      }
    }
    ack?.(core.ok({ roomCode }));
  };

  const commandPlayerResume: EngineCommandApi['commandPlayerResume'] = (socket, payload, ack) => {
    const { playerSessionToken } = payload ?? {};
    if (!playerSessionToken) {
      ack?.(core.err(ACK_ERROR_CODES.TOKEN_REQUIRED, 'playerSessionToken is required.'));
      return;
    }

    const terminated = core.getTerminationRecordBySession(playerSessionToken);
    if (terminated) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, core.formatTerminationMessage(terminated)));
      return;
    }

    const session = core.playerSessions.get(playerSessionToken);
    if (!session) {
      ack?.(core.err(ACK_ERROR_CODES.SESSION_NOT_FOUND, 'Player session not found.'));
      return;
    }

    const room = core.rooms.get(session.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }

    const player = room.players.find((entry) => entry.id === session.playerId);
    if (!player) {
      ack?.(core.err(ACK_ERROR_CODES.PLAYER_NOT_FOUND, 'Player not found.'));
      return;
    }

    const userAgent = core.normalizeUserAgent(socket.handshake.headers['user-agent']);
    if (!core.isMobileUserAgent(userAgent)) {
      ack?.(core.err(ACK_ERROR_CODES.NON_MOBILE_DEVICE, 'Please join from a phone.'));
      return;
    }

    if (player.socketId && player.socketId !== socket.id) {
      core.disconnectSocket(player.socketId);
    }

    player.socketId = socket.id;
    player.connected = true;
    core.socketIndex.set(socket.id, { role: 'player', roomCode: room.code, playerId: player.id });
    socket.join(room.code);

    core.bumpSeq(room);
    core.recordTransition(room, 'PLAYER_RESUME', { playerId: player.id });
    core.emitSnapshot(room);
    if (room.phase !== 'LOBBY' && room.currentCard) {
      const activePlayer = core.ensureActivePlayer(room);
      if (activePlayer && activePlayer.id === player.id) {
        socket.emit(SERVER_TO_CLIENT_EVENTS.TURN_DEALT_PLAYER, {
          activePlayerId: activePlayer.id,
          turnNumber: room.turnNumber,
          timeline: activePlayer.timeline,
        });
      }
    }
    ack?.(core.ok({ roomCode: room.code, playerId: player.id }));
  };

  const commandGameStart: EngineCommandApi['commandGameStart'] = (socket, _payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only the host can start the game.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }

    if (room.phase !== 'LOBBY') {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_LOCKED, 'Game already started.'));
      return;
    }

    if (room.players.length < 1) {
      ack?.(core.err(ACK_ERROR_CODES.NOT_ENOUGH_PLAYERS, 'At least 1 player is required.'));
      return;
    }

    room.players.forEach((player) => {
      player.timeline = [];
    });
    room.turnOrder = room.players.map((player) => player.id);
    room.activePlayerIndex = 0;
    room.turnNumber = 0;
    room.deck = core.shuffleCards(baseDeck);
    room.currentCard = null;
    room.tentativePlacementIndex = null;
    room.phase = 'DEAL';
    core.resetPauseState(room);

    turns.seedTimelines(room);

    core.bumpSeq(room);
    core.recordTransition(room, 'GAME_START', { playerCount: room.players.length });
    core.emitSnapshot(room);
    io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.GAME_STARTED, {
      turnOrder: room.turnOrder,
      activePlayerId: room.turnOrder[0] ?? null,
      turnNumber: room.turnNumber,
      timelines: core.buildTimelines(room),
    });

    turns.startTurn(room);
    ack?.(core.ok());
  };

  const commandGamePause: EngineCommandApi['commandGamePause'] = (socket, payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only the host can pause the game.'));
      return;
    }

    const { roomCode } = payload ?? {};
    if (!roomCode) {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PAYLOAD, 'roomCode is required.'));
      return;
    }
    if (roomCode !== connection.roomCode) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_MISMATCH, 'roomCode does not match host session.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }
    if (room.phase === 'LOBBY' || room.phase === 'END') {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PHASE, 'Game is not in progress.'));
      return;
    }
    if (room.isPaused) {
      ack?.(core.err(ACK_ERROR_CODES.ALREADY_PAUSED, 'Game is already paused.'));
      return;
    }

    turns.pauseRoom(room);
    core.recordAction('GAME_PAUSE_REQUEST', { roomCode: room.code });
    ack?.(core.ok());
  };

  const commandGameResume: EngineCommandApi['commandGameResume'] = (socket, payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only the host can resume the game.'));
      return;
    }

    const { roomCode } = payload ?? {};
    if (!roomCode) {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PAYLOAD, 'roomCode is required.'));
      return;
    }
    if (roomCode !== connection.roomCode) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_MISMATCH, 'roomCode does not match host session.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }
    if (!room.isPaused) {
      ack?.(core.err(ACK_ERROR_CODES.NOT_PAUSED, 'Game is not paused.'));
      return;
    }

    turns.resumeRoom(room);
    core.recordAction('GAME_RESUME_REQUEST', { roomCode: room.code });
    ack?.(core.ok());
  };

  const commandGameTerminate: EngineCommandApi['commandGameTerminate'] = (socket, payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only the host can end the game.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has already been terminated.'));
      return;
    }

    const reason = payload?.reason?.trim() || 'HOST_ENDED';
    core.recordAction('GAME_TERMINATE_REQUEST', { roomCode: room.code, reason });
    core.terminateRoom(room, reason);
    ack?.(core.ok());
  };

  const commandTurnPlace: EngineCommandApi['commandTurnPlace'] = (socket, payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'player') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only players can place cards.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }
    if (room.isPaused) {
      ack?.(core.err(ACK_ERROR_CODES.GAME_PAUSED, 'Game is paused.'));
      return;
    }

    if (room.phase !== 'PLACE') {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PHASE, 'Not accepting placements right now.'));
      return;
    }

    const activePlayer = core.ensureActivePlayer(room);
    if (!activePlayer) {
      ack?.(core.err(ACK_ERROR_CODES.PLAYER_NOT_FOUND, 'Active player not found.'));
      return;
    }

    if (activePlayer.id !== connection.playerId) {
      ack?.(core.err(ACK_ERROR_CODES.NOT_ACTIVE_PLAYER, 'Only the active player can place.'));
      return;
    }

    const { placementIndex } = payload ?? {};
    if (
      typeof placementIndex !== 'number' ||
      placementIndex < 0 ||
      placementIndex > activePlayer.timeline.length
    ) {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PLACEMENT, 'Invalid placement index.'));
      return;
    }

    room.tentativePlacementIndex = placementIndex;
    core.bumpSeq(room);
    core.recordTransition(room, 'TURN_PLACE', {
      playerId: activePlayer.id,
      placementIndex,
    });
    core.emitSnapshot(room);
    io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.TURN_PLACED, {
      playerId: activePlayer.id,
      placementIndex,
    });
    ack?.(core.ok());
  };

  const commandTurnRemove: EngineCommandApi['commandTurnRemove'] = (socket, _payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'player') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only players can remove placements.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }
    if (room.isPaused) {
      ack?.(core.err(ACK_ERROR_CODES.GAME_PAUSED, 'Game is paused.'));
      return;
    }

    if (room.phase !== 'PLACE') {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PHASE, 'Not accepting removals right now.'));
      return;
    }

    const activePlayer = core.ensureActivePlayer(room);
    if (!activePlayer) {
      ack?.(core.err(ACK_ERROR_CODES.PLAYER_NOT_FOUND, 'Active player not found.'));
      return;
    }

    if (activePlayer.id !== connection.playerId) {
      ack?.(core.err(ACK_ERROR_CODES.NOT_ACTIVE_PLAYER, 'Only the active player can remove.'));
      return;
    }

    if (room.tentativePlacementIndex === null) {
      ack?.(core.ok());
      return;
    }

    room.tentativePlacementIndex = null;
    core.bumpSeq(room);
    core.recordTransition(room, 'TURN_REMOVE', {
      playerId: activePlayer.id,
    });
    core.emitSnapshot(room);
    io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.TURN_REMOVED, {
      playerId: activePlayer.id,
    });
    ack?.(core.ok());
  };

  const handleReveal = (socket: Socket, ack?: Ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'player') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only players can reveal.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }
    if (room.isPaused) {
      ack?.(core.err(ACK_ERROR_CODES.GAME_PAUSED, 'Game is paused.'));
      return;
    }

    if (room.phase !== 'PLACE') {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PHASE, 'Not accepting reveals right now.'));
      return;
    }

    const activePlayer = core.ensureActivePlayer(room);
    if (!activePlayer) {
      ack?.(core.err(ACK_ERROR_CODES.PLAYER_NOT_FOUND, 'Active player not found.'));
      return;
    }

    if (activePlayer.id !== connection.playerId) {
      ack?.(core.err(ACK_ERROR_CODES.NOT_ACTIVE_PLAYER, 'Only the active player can reveal.'));
      return;
    }

    if (room.tentativePlacementIndex === null) {
      ack?.(core.err(ACK_ERROR_CODES.NO_PLACEMENT, 'Place the card before revealing.'));
      return;
    }

    turns.resolveLock(room, 'LOCK');
    core.recordAction('TURN_REVEAL_REQUEST', {
      roomCode: room.code,
      playerId: activePlayer.id,
    });
    ack?.(core.ok());
  };

  const commandTurnLock: EngineCommandApi['commandTurnLock'] = (socket, _payload, ack) => {
    handleReveal(socket, ack);
  };

  const commandTurnReveal: EngineCommandApi['commandTurnReveal'] = (socket, _payload, ack) => {
    handleReveal(socket, ack);
  };

  const commandKickPlayer: EngineCommandApi['commandKickPlayer'] = (socket, payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only the host can kick players.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }

    const { playerId } = payload ?? {};
    if (!playerId) {
      ack?.(core.err(ACK_ERROR_CODES.INVALID_PAYLOAD, 'playerId is required.'));
      return;
    }

    const playerIndex = room.players.findIndex((entry) => entry.id === playerId);
    if (playerIndex === -1) {
      ack?.(core.err(ACK_ERROR_CODES.PLAYER_NOT_FOUND, 'Player not found.'));
      return;
    }

    const [removedPlayer] = room.players.splice(playerIndex, 1);
    core.playerSessions.delete(removedPlayer.sessionToken);
    if (removedPlayer.socketId) {
      io.to(removedPlayer.socketId).emit(SERVER_TO_CLIENT_EVENTS.PLAYER_KICKED, { playerId: removedPlayer.id });
    }

    const { removedTurnIndex, removedWasActive } = removePlayerFromTurnState(room, removedPlayer.id);

    if (room.turnOrder.length === 0 && room.phase !== 'LOBBY' && room.phase !== 'END') {
      core.terminateRoom(room, 'NO_PLAYERS');
      core.disconnectSocket(removedPlayer.socketId);
      ack?.(core.ok({ playerId: removedPlayer.id }));
      return;
    }

    if (removedWasActive && room.phase !== 'LOBBY' && room.phase !== 'END') {
      core.clearRoomTimers(room);
      room.currentCard = null;
      room.tentativePlacementIndex = null;
      room.turnExpiresAt = null;
      room.phase = 'DEAL';
      if (!room.isPaused) {
        turns.startTurn(room);
      } else {
        room.pausedTurnRemainingMs = null;
        room.pausedRevealRemainingMs = null;
      }
    }

    core.bumpSeq(room);
    core.recordTransition(room, 'PLAYER_KICK', {
      removedPlayerId: removedPlayer.id,
      removedTurnIndex,
      removedWasActive,
      remainingPlayers: room.players.length,
    });
    core.emitSnapshot(room);
    core.disconnectSocket(removedPlayer.socketId);
    ack?.(core.ok({ playerId: removedPlayer.id }));
  };

  const commandRoomLeave: EngineCommandApi['commandRoomLeave'] = (socket, _payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection) {
      ack?.(core.err(ACK_ERROR_CODES.NOT_IN_ROOM, 'Socket is not in a room.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      core.socketIndex.delete(socket.id);
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }

    if (connection.role === 'host') {
      core.closeRoom(room, 'HOST_LEFT');
      ack?.(core.ok());
      return;
    }

    if (room.phase !== 'LOBBY') {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_LOCKED, 'Cannot leave after the game has started.'));
      return;
    }

    const playerIndex = room.players.findIndex((entry) => entry.id === connection.playerId);
    if (playerIndex === -1) {
      core.socketIndex.delete(socket.id);
      ack?.(core.err(ACK_ERROR_CODES.PLAYER_NOT_FOUND, 'Player not found.'));
      return;
    }

    const [player] = room.players.splice(playerIndex, 1);
    core.playerSessions.delete(player.sessionToken);
    core.socketIndex.delete(socket.id);
    socket.leave(room.code);

    core.bumpSeq(room);
    core.recordTransition(room, 'ROOM_LEAVE', { playerId: player.id });
    core.emitSnapshot(room);
    ack?.(core.ok());
  };

  const commandRoomDelete: EngineCommandApi['commandRoomDelete'] = (socket, _payload, ack) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection || connection.role !== 'host') {
      ack?.(core.err(ACK_ERROR_CODES.FORBIDDEN, 'Only the host can delete the room.'));
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.'));
      return;
    }
    if (room.terminatedAt) {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_TERMINATED, 'Room has been terminated.'));
      return;
    }

    if (room.phase !== 'LOBBY') {
      ack?.(core.err(ACK_ERROR_CODES.ROOM_LOCKED, 'Cannot delete after the game has started.'));
      return;
    }

    core.closeRoom(room, 'HOST_DELETED');
    ack?.(core.ok());
  };

  const commandDisconnect: EngineCommandApi['commandDisconnect'] = (socket) => {
    const connection = core.socketIndex.get(socket.id);
    if (!connection) {
      return;
    }

    const room = core.rooms.get(connection.roomCode);
    if (!room) {
      core.socketIndex.delete(socket.id);
      return;
    }

    if (connection.role === 'host') {
      core.recordAction('SOCKET_DISCONNECT', { role: 'host', roomCode: room.code });
      room.host.connected = false;
      room.host.socketId = undefined;
    } else {
      const player = room.players.find((entry) => entry.id === connection.playerId);
      if (player) {
        core.recordAction('SOCKET_DISCONNECT', {
          role: 'player',
          roomCode: room.code,
          playerId: player.id,
        });
        player.connected = false;
        player.socketId = undefined;
      }
    }

    core.socketIndex.delete(socket.id);
    core.bumpSeq(room);
    core.recordTransition(room, 'SOCKET_DISCONNECT');
    core.emitSnapshot(room);
  };

  return {
    commandRoomCreate,
    commandRoomJoin,
    commandHostResume,
    commandPlayerResume,
    commandGameStart,
    commandGamePause,
    commandGameResume,
    commandGameTerminate,
    commandTurnPlace,
    commandTurnRemove,
    commandTurnLock,
    commandTurnReveal,
    commandKickPlayer,
    commandRoomLeave,
    commandRoomDelete,
    commandDisconnect,
  };
};
