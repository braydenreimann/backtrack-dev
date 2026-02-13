const HOST_SESSION_KEY = 'bt:hostSessionToken';
const HOST_ROOM_KEY = 'bt:hostRoomCode';
const PLAYER_SESSION_KEY = 'bt:playerSessionToken';
const PLAYER_ID_KEY = 'bt:playerId';
const PLAYER_ROOM_KEY = 'bt:playerRoomCode';
const PLAYER_NAME_KEY = 'bt:playerName';
const TERMINATION_KEY_PREFIX = 'bt:room-terminated:';
const ROOM_KEY_PREFIX = 'bt:';
const TERMINATION_TTL_MS = 10 * 60 * 1000;

export type RoomTerminationRecord = {
  roomCode: string;
  reason: string;
  terminatedAt: number;
  expiresAt: number;
};

const isValidTerminationRecord = (value: unknown): value is RoomTerminationRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RoomTerminationRecord>;
  return (
    typeof candidate.roomCode === 'string' &&
    typeof candidate.reason === 'string' &&
    typeof candidate.terminatedAt === 'number' &&
    Number.isFinite(candidate.terminatedAt) &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt)
  );
};

const safeLocalStorage = () => (typeof window === 'undefined' ? null : window.localStorage);
const safeSessionStorage = () => (typeof window === 'undefined' ? null : window.sessionStorage);

const buildRoomKey = (roomCode: string, suffix: string) => `${ROOM_KEY_PREFIX}${roomCode}:${suffix}`;
const buildTerminationKey = (roomCode: string) => `${TERMINATION_KEY_PREFIX}${roomCode}`;

const readTerminationRecord = (roomCode: string) => {
  const key = buildTerminationKey(roomCode);
  const local = safeLocalStorage()?.getItem(key);
  const session = safeSessionStorage()?.getItem(key);
  const raw = local ?? session;
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidTerminationRecord(parsed) || parsed.expiresAt <= Date.now()) {
      safeLocalStorage()?.removeItem(key);
      safeSessionStorage()?.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    safeLocalStorage()?.removeItem(key);
    safeSessionStorage()?.removeItem(key);
    return null;
  }
};

const clearStoragePrefix = (storage: Storage | null, prefix: string) => {
  if (!storage) {
    return;
  }
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && key.startsWith(prefix)) {
      storage.removeItem(key);
    }
  }
};

export const getHostSessionToken = () => safeLocalStorage()?.getItem(HOST_SESSION_KEY) ?? null;
export const getHostRoomCode = () => safeLocalStorage()?.getItem(HOST_ROOM_KEY) ?? null;

export const setHostSession = (token: string, roomCode: string) => {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }
  storage.setItem(HOST_SESSION_KEY, token);
  storage.setItem(HOST_ROOM_KEY, roomCode);
};

export const clearHostSession = () => {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(HOST_SESSION_KEY);
  storage.removeItem(HOST_ROOM_KEY);
};

export const getPlayerSessionToken = () => safeLocalStorage()?.getItem(PLAYER_SESSION_KEY) ?? null;
export const getPlayerId = () => safeLocalStorage()?.getItem(PLAYER_ID_KEY) ?? null;
export const getPlayerRoomCode = () => safeLocalStorage()?.getItem(PLAYER_ROOM_KEY) ?? null;
export const getPlayerName = () => safeLocalStorage()?.getItem(PLAYER_NAME_KEY) ?? null;

export const setPlayerSession = (
  token: string,
  playerId: string,
  roomCode: string,
  playerName: string
) => {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }
  storage.setItem(PLAYER_SESSION_KEY, token);
  storage.setItem(PLAYER_ID_KEY, playerId);
  storage.setItem(PLAYER_ROOM_KEY, roomCode);
  storage.setItem(PLAYER_NAME_KEY, playerName);
};

export const clearPlayerSession = () => {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(PLAYER_SESSION_KEY);
  storage.removeItem(PLAYER_ID_KEY);
  storage.removeItem(PLAYER_ROOM_KEY);
  storage.removeItem(PLAYER_NAME_KEY);
};

export const getControllerHelpKey = (roomCode: string) =>
  buildRoomKey(roomCode, 'controller-help-dismissed');

export const markRoomTerminated = (
  roomCode: string,
  reason: string,
  terminatedAt: number = Date.now()
) => {
  const record: RoomTerminationRecord = {
    roomCode,
    reason,
    terminatedAt,
    expiresAt: terminatedAt + TERMINATION_TTL_MS,
  };
  const payload = JSON.stringify(record);
  const key = buildTerminationKey(roomCode);
  safeLocalStorage()?.setItem(key, payload);
  safeSessionStorage()?.setItem(key, payload);
};

export const consumeRoomTermination = (roomCode: string): RoomTerminationRecord | null => {
  const record = readTerminationRecord(roomCode);
  if (!record) {
    return null;
  }
  const key = buildTerminationKey(roomCode);
  safeLocalStorage()?.removeItem(key);
  safeSessionStorage()?.removeItem(key);
  return record;
};

export const clearRoomStorage = (roomCode: string) => {
  const roomPrefix = buildRoomKey(roomCode, '');
  clearStoragePrefix(safeLocalStorage(), roomPrefix);
  clearStoragePrefix(safeSessionStorage(), roomPrefix);

  if (getHostRoomCode() === roomCode) {
    clearHostSession();
  }
  if (getPlayerRoomCode() === roomCode) {
    clearPlayerSession();
  }
};
