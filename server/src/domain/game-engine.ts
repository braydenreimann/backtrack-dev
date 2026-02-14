import type { Server } from 'socket.io';
import { readGameRuntimeConfig } from '../config/game-runtime.js';
import { createCommandApi } from './commands.js';
import { baseDeck } from './deck.js';
import { createCoreRuntime } from './core-runtime.js';
import { createTurnRuntime } from './turn-runtime.js';
import type { GameEngine } from './types.js';
import { createTelemetry } from '../observability/telemetry.js';

export const createGameEngine = (io: Server): GameEngine => {
  const telemetry = createTelemetry();
  const core = createCoreRuntime(io, { telemetry });
  const turns = createTurnRuntime(io, core, readGameRuntimeConfig());
  const commands = createCommandApi(io, core, turns, baseDeck);
  const { clearRoomTimers: _clearRoomTimers, buildScores: _buildScores, ...corePublic } = core;

  return {
    ...corePublic,
    ...turns,
    ...commands,
    baseDeck,
  };
};

export type {
  Ack,
  ConnectionIndex,
  GameEngine,
  HostState,
  PlayerState,
  RoomState,
  TerminationRecord,
} from './types.js';
