import {
  clearHostSession,
  clearPlayerSession,
  clearRoomStorage,
  getHostRoomCode,
  getHostSessionToken,
  getPlayerRoomCode,
  getPlayerSessionToken,
} from '@/lib/storage';

export type SessionRole = 'host' | 'player';

export const getSessionTokenForRole = (role: SessionRole): string | null =>
  role === 'host' ? getHostSessionToken() : getPlayerSessionToken();

export const getSessionRoomCodeForRole = (role: SessionRole): string | null =>
  role === 'host' ? getHostRoomCode() : getPlayerRoomCode();

export const clearSessionForRole = (role: SessionRole) => {
  if (role === 'host') {
    clearHostSession();
    return;
  }
  clearPlayerSession();
};

export const clearRoomSessionForRole = (role: SessionRole, roomCode?: string | null) => {
  if (roomCode) {
    clearRoomStorage(roomCode);
    return;
  }
  clearSessionForRole(role);
};
