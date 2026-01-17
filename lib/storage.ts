const HOST_SESSION_KEY = 'bt:hostSessionToken';
const HOST_ROOM_KEY = 'bt:hostRoomCode';
const PLAYER_SESSION_KEY = 'bt:playerSessionToken';
const PLAYER_ID_KEY = 'bt:playerId';
const PLAYER_ROOM_KEY = 'bt:playerRoomCode';
const PLAYER_NAME_KEY = 'bt:playerName';

const safeStorage = () => (typeof window === 'undefined' ? null : window.localStorage);

export const getHostSessionToken = () => safeStorage()?.getItem(HOST_SESSION_KEY) ?? null;
export const getHostRoomCode = () => safeStorage()?.getItem(HOST_ROOM_KEY) ?? null;

export const setHostSession = (token: string, roomCode: string) => {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  storage.setItem(HOST_SESSION_KEY, token);
  storage.setItem(HOST_ROOM_KEY, roomCode);
};

export const clearHostSession = () => {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(HOST_SESSION_KEY);
  storage.removeItem(HOST_ROOM_KEY);
};

export const getPlayerSessionToken = () => safeStorage()?.getItem(PLAYER_SESSION_KEY) ?? null;
export const getPlayerId = () => safeStorage()?.getItem(PLAYER_ID_KEY) ?? null;
export const getPlayerRoomCode = () => safeStorage()?.getItem(PLAYER_ROOM_KEY) ?? null;
export const getPlayerName = () => safeStorage()?.getItem(PLAYER_NAME_KEY) ?? null;

export const setPlayerSession = (
  token: string,
  playerId: string,
  roomCode: string,
  playerName: string
) => {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  storage.setItem(PLAYER_SESSION_KEY, token);
  storage.setItem(PLAYER_ID_KEY, playerId);
  storage.setItem(PLAYER_ROOM_KEY, roomCode);
  storage.setItem(PLAYER_NAME_KEY, playerName);
};

export const clearPlayerSession = () => {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(PLAYER_SESSION_KEY);
  storage.removeItem(PLAYER_ID_KEY);
  storage.removeItem(PLAYER_ROOM_KEY);
  storage.removeItem(PLAYER_NAME_KEY);
};
