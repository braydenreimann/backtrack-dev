import { describe, expect, it, vi } from 'vitest';
import {
  clearRoomStorage,
  consumeRoomTermination,
  getControllerHelpKey,
  getHostSessionToken,
  getPlayerSessionToken,
  markRoomTerminated,
  setHostSession,
  setPlayerSession,
} from '@/lib/storage';

const ROOM_CODE = 'ROOM42';
const TERMINATION_KEY = `bt:room-terminated:${ROOM_CODE}`;

const resetStorage = () => {
  localStorage.clear();
  sessionStorage.clear();
};

describe('room termination storage', () => {
  it('stores and consumes a termination marker', () => {
    resetStorage();
    const terminatedAt = Date.now();

    markRoomTerminated(ROOM_CODE, 'HOST_ENDED', terminatedAt);

    expect(localStorage.getItem(TERMINATION_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(TERMINATION_KEY)).not.toBeNull();

    const record = consumeRoomTermination(ROOM_CODE);
    expect(record).toMatchObject({
      roomCode: ROOM_CODE,
      reason: 'HOST_ENDED',
      terminatedAt,
    });

    expect(localStorage.getItem(TERMINATION_KEY)).toBeNull();
    expect(sessionStorage.getItem(TERMINATION_KEY)).toBeNull();
  });

  it('expires termination markers past the TTL', () => {
    resetStorage();
    vi.useFakeTimers();
    const start = new Date('2024-01-01T00:00:00.000Z');
    vi.setSystemTime(start);

    markRoomTerminated(ROOM_CODE, 'HOST_ENDED');
    vi.setSystemTime(new Date('2024-01-01T00:10:01.000Z'));

    expect(consumeRoomTermination(ROOM_CODE)).toBeNull();
    vi.useRealTimers();
  });
});

describe('clearRoomStorage', () => {
  it('clears room-scoped keys and matching sessions only', () => {
    resetStorage();
    setHostSession('host-token', ROOM_CODE);
    setPlayerSession('player-token', 'P1', ROOM_CODE, 'Player');
    localStorage.setItem(`bt:${ROOM_CODE}:controller-help-dismissed`, 'true');
    localStorage.setItem('bt:OTHER:controller-help-dismissed', 'true');
    sessionStorage.setItem(`bt:${ROOM_CODE}:temp`, 'value');
    sessionStorage.setItem('bt:OTHER:temp', 'value');

    clearRoomStorage(ROOM_CODE);

    expect(getHostSessionToken()).toBeNull();
    expect(getPlayerSessionToken()).toBeNull();
    expect(localStorage.getItem(`bt:${ROOM_CODE}:controller-help-dismissed`)).toBeNull();
    expect(sessionStorage.getItem(`bt:${ROOM_CODE}:temp`)).toBeNull();
    expect(localStorage.getItem('bt:OTHER:controller-help-dismissed')).toBe('true');
    expect(sessionStorage.getItem('bt:OTHER:temp')).toBe('value');
  });

  it('builds room-scoped help keys', () => {
    expect(getControllerHelpKey(ROOM_CODE)).toBe(`bt:${ROOM_CODE}:controller-help-dismissed`);
  });
});
