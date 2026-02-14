type RoomTelemetryState = {
  code: string;
  seq: number;
  phase: string;
  turnOrder: string[];
  activePlayerIndex: number;
};

export type Telemetry = {
  recordAction: (action: string, details?: Record<string, unknown>) => void;
  recordTransition: (
    action: string,
    room: RoomTelemetryState,
    details?: Record<string, unknown>
  ) => void;
};

const isEnabledByDefault = () => process.env.NODE_ENV !== 'test';

const isTelemetryEnabled = () => {
  const value = process.env.BACKTRACK_TELEMETRY?.trim();
  if (value === '0' || value === 'false') {
    return false;
  }
  if (value === '1' || value === 'true') {
    return true;
  }
  return isEnabledByDefault();
};

const nowIso = () => new Date().toISOString();

const emit = (payload: Record<string, unknown>) => {
  console.log(JSON.stringify({ timestamp: nowIso(), ...payload }));
};

const getActivePlayerId = (room: RoomTelemetryState): string | null =>
  room.turnOrder[room.activePlayerIndex] ?? null;

export const createTelemetry = (): Telemetry => {
  const enabled = isTelemetryEnabled();

  const recordAction: Telemetry['recordAction'] = (action, details) => {
    if (!enabled) {
      return;
    }
    emit({
      type: 'action',
      action,
      ...(details ? { details } : {}),
    });
  };

  const recordTransition: Telemetry['recordTransition'] = (action, room, details) => {
    if (!enabled) {
      return;
    }
    emit({
      type: 'state_transition',
      action,
      roomCode: room.code,
      seq: room.seq,
      phase: room.phase,
      activePlayerId: getActivePlayerId(room),
      ...(details ? { details } : {}),
    });
  };

  return {
    recordAction,
    recordTransition,
  };
};
