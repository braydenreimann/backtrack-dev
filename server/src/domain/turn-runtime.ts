import type { Server } from 'socket.io';
import { SERVER_TO_CLIENT_EVENTS } from '../../../lib/contracts/socket.js';
import type { Card } from '../../../lib/contracts/game.js';
import type { EngineCoreRuntime, RoomState, TurnRuntime } from './types.js';
import type { GameRuntimeConfig } from '../config/game-runtime.js';

export const createTurnRuntime = (
  io: Server,
  core: EngineCoreRuntime,
  config: GameRuntimeConfig
): TurnRuntime => {
  const { turnDurationMs, revealDurationMs, winCardCount } = config;

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

  const endGame = (room: RoomState, payload: { winnerId?: string; reason: string }) => {
    core.clearRoomTimers(room);
    core.resetPauseState(room);
    room.phase = 'END';
    room.currentCard = null;
    room.tentativePlacementIndex = null;
    room.turnExpiresAt = null;
    core.bumpSeq(room);
    core.recordTransition(room, 'GAME_END', payload);
    core.emitSnapshot(room);
    io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.GAME_ENDED, payload);
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
    if (room.terminatedAt) {
      return;
    }
    room.revealExpiresAt = Date.now() + delayMs;
    room.revealTimer = setTimeout(() => {
      if (room.terminatedAt) {
        return;
      }
      advanceToNextPlayer(room);
      startTurn(room);
    }, delayMs);
  };

  const emitTurnDealt = (room: RoomState, expiresAt: number) => {
    const activePlayer = core.ensureActivePlayer(room);
    if (!activePlayer || !room.currentCard) {
      return;
    }

    io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.TURN_DEALT, {
      activePlayerId: activePlayer.id,
      turnNumber: room.turnNumber,
      expiresAt,
    });

    if (room.host.socketId) {
      io.to(room.host.socketId).emit(SERVER_TO_CLIENT_EVENTS.TURN_DEALT_HOST, {
        activePlayerId: activePlayer.id,
        turnNumber: room.turnNumber,
        card: room.currentCard,
        timelines: core.buildTimelines(room),
      });
    }

    if (activePlayer.socketId) {
      io.to(activePlayer.socketId).emit(SERVER_TO_CLIENT_EVENTS.TURN_DEALT_PLAYER, {
        activePlayerId: activePlayer.id,
        turnNumber: room.turnNumber,
        timeline: activePlayer.timeline,
      });
    }
  };

  const resolveLock = (room: RoomState, reason: 'LOCK' | 'TIMEOUT') => {
    if (room.terminatedAt) {
      return;
    }
    if (room.isPaused) {
      return;
    }
    const activePlayer = core.ensureActivePlayer(room);
    if (!activePlayer || !room.currentCard || room.tentativePlacementIndex === null) {
      return;
    }

    core.clearRoomTimers(room);
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

    io.to(room.code).emit(SERVER_TO_CLIENT_EVENTS.TURN_REVEAL, {
      playerId: activePlayer.id,
      card,
      correct,
      placementIndex,
      timeline: activePlayer.timeline,
      scores: core.buildScores(room),
      reason,
    });

    core.bumpSeq(room);
    core.recordTransition(room, 'TURN_REVEAL', {
      reason,
      playerId: activePlayer.id,
      correct,
      placementIndex,
    });
    core.emitSnapshot(room);

    if (activePlayer.timeline.length >= winCardCount) {
      endGame(room, { winnerId: activePlayer.id, reason: 'WIN' });
      return;
    }

    scheduleNextTurn(room, revealDurationMs);
  };

  const handleTurnTimeout = (roomCode: string) => {
    const room = core.rooms.get(roomCode);
    if (!room) {
      return;
    }
    if (room.terminatedAt) {
      return;
    }
    if (room.isPaused) {
      return;
    }
    if (!room.currentCard) {
      return;
    }
    const activePlayer = core.ensureActivePlayer(room);
    if (!activePlayer) {
      return;
    }

    if (room.tentativePlacementIndex === null) {
      room.tentativePlacementIndex = activePlayer.timeline.length;
    }

    resolveLock(room, 'TIMEOUT');
  };

  const startTurn = (room: RoomState) => {
    if (room.terminatedAt) {
      return;
    }
    if (room.isPaused) {
      return;
    }
    core.clearRoomTimers(room);
    const activePlayer = core.ensureActivePlayer(room);
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
    const expiresAt = Date.now() + turnDurationMs;
    room.turnExpiresAt = expiresAt;

    core.bumpSeq(room);
    core.recordTransition(room, 'TURN_START', {
      activePlayerId: activePlayer.id,
      turnNumber: room.turnNumber,
      expiresAt,
    });
    core.emitSnapshot(room);
    emitTurnDealt(room, expiresAt);
    room.phase = 'PLACE';

    room.turnTimer = setTimeout(() => {
      handleTurnTimeout(room.code);
    }, turnDurationMs);
  };

  const pauseRoom = (room: RoomState) => {
    if (room.isPaused) {
      return;
    }
    const now = Date.now();
    room.isPaused = true;
    room.pausedTurnRemainingMs =
      room.turnTimer && room.turnExpiresAt ? Math.max(0, room.turnExpiresAt - now) : null;
    room.pausedRevealRemainingMs =
      room.revealTimer && room.revealExpiresAt ? Math.max(0, room.revealExpiresAt - now) : null;
    core.clearRoomTimers(room);
    core.bumpSeq(room);
    core.recordTransition(room, 'GAME_PAUSE', {
      pausedTurnRemainingMs: room.pausedTurnRemainingMs,
      pausedRevealRemainingMs: room.pausedRevealRemainingMs,
    });
    core.emitSnapshot(room);
  };

  const resumeRoom = (room: RoomState) => {
    if (!room.isPaused) {
      return;
    }
    const remainingTurnMs = room.pausedTurnRemainingMs;
    const remainingRevealMs = room.pausedRevealRemainingMs;
    core.resetPauseState(room);

    if (remainingRevealMs !== null) {
      scheduleNextTurn(room, remainingRevealMs);
    } else if (remainingTurnMs !== null) {
      const delayMs = Math.max(0, remainingTurnMs);
      room.turnExpiresAt = Date.now() + delayMs;
      room.turnTimer = setTimeout(() => {
        handleTurnTimeout(room.code);
      }, delayMs);
    }

    core.bumpSeq(room);
    core.recordTransition(room, 'GAME_RESUME', {
      remainingTurnMs,
      remainingRevealMs,
    });
    core.emitSnapshot(room);
  };

  return {
    pauseRoom,
    resumeRoom,
    seedTimelines,
    startTurn,
    resolveLock,
  };
};
