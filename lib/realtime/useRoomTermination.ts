'use client';

import { useCallback, useEffect, useRef } from 'react';
import { consumeRoomTermination, markRoomTerminated } from '@/lib/storage';
import { clearRoomSessionForRole, type SessionRole } from '@/lib/realtime/session-role';

type TerminationPayload = { reason: string; terminatedAt: number };

type UseRoomTerminationOptions = {
  role: SessionRole;
  roomCode?: string;
  isMock: boolean;
  redirectDelayMs?: number;
  onTerminateNow: () => void;
  onRedirect: () => void;
  onStatus?: (status: string) => void;
  onClearError?: () => void;
};

export const useRoomTermination = ({
  role,
  roomCode,
  isMock,
  redirectDelayMs = 1500,
  onTerminateNow,
  onRedirect,
  onStatus,
  onClearError,
}: UseRoomTerminationOptions) => {
  const terminatedRef = useRef(false);
  const redirectTimeoutRef = useRef<number | null>(null);

  const clearRedirectTimeout = useCallback(() => {
    if (redirectTimeoutRef.current !== null) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
  }, []);

  const handleTermination = useCallback(
    (payload: TerminationPayload, options?: { persistMarker?: boolean }) => {
      if (terminatedRef.current) {
        return;
      }

      if (roomCode) {
        if (options?.persistMarker !== false) {
          markRoomTerminated(roomCode, payload.reason, payload.terminatedAt);
        }
      }

      clearRoomSessionForRole(role, roomCode);
      clearRedirectTimeout();
      terminatedRef.current = true;
      onClearError?.();
      onStatus?.('Game ended by host.');
      onTerminateNow();

      redirectTimeoutRef.current = window.setTimeout(() => {
        onRedirect();
      }, redirectDelayMs);
    },
    [
      clearRedirectTimeout,
      onClearError,
      onRedirect,
      onStatus,
      onTerminateNow,
      redirectDelayMs,
      role,
      roomCode,
    ]
  );

  useEffect(() => {
    if (!roomCode || isMock) {
      return;
    }
    const record = consumeRoomTermination(roomCode);
    if (record) {
      handleTermination(record, { persistMarker: false });
    }
  }, [handleTermination, isMock, roomCode]);

  useEffect(
    () => () => {
      clearRedirectTimeout();
    },
    [clearRedirectTimeout]
  );

  return {
    terminatedRef,
    clearRedirectTimeout,
    handleTermination,
  };
};
