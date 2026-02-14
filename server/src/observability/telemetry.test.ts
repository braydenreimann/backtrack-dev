import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry } from './telemetry';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('telemetry', () => {
  it('emits state transition logs with room context', () => {
    process.env.BACKTRACK_TELEMETRY = '1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const telemetry = createTelemetry();

    telemetry.recordTransition(
      'TURN_START',
      {
        code: '123456',
        seq: 12,
        phase: 'PLACE',
        turnOrder: ['P01', 'P02'],
        activePlayerIndex: 1,
      },
      { turnNumber: 4 }
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.type).toBe('state_transition');
    expect(payload.action).toBe('TURN_START');
    expect(payload.roomCode).toBe('123456');
    expect(payload.seq).toBe(12);
    expect(payload.phase).toBe('PLACE');
    expect(payload.activePlayerId).toBe('P02');
  });

  it('does not emit logs when telemetry is disabled', () => {
    process.env.BACKTRACK_TELEMETRY = '0';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const telemetry = createTelemetry();

    telemetry.recordAction('ROOM_CREATE', { roomCode: '999999' });
    expect(spy).not.toHaveBeenCalled();
  });
});
