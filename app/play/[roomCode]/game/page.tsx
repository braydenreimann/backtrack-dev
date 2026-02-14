'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import { isPhoneDevice } from '@/lib/device';
import type { Card, RoomSnapshot, TurnReveal } from '@/lib/contracts/game';
import {
  ACK_ERROR_CODES,
  CLIENT_TO_SERVER_EVENTS,
  SERVER_TO_CLIENT_EVENTS,
  type AckResponse,
  type GameEndedPayload,
  type GameTerminationPayload,
  type PlayerResumeAck,
  type RoomClosedPayload,
  type TurnDealtPayload,
  type TurnDealtPlayerPayload,
  type TurnPlacedPayload,
  type TurnRemovedPayload,
} from '@/lib/contracts/socket';
import {
  getControllerHelpKey,
  getPlayerId,
  getPlayerName,
} from '@/lib/storage';
import {
  clearRoomSessionForRole,
  clearSessionForRole,
  getSessionRoomCodeForRole,
  getSessionTokenForRole,
} from '@/lib/realtime/session-role';
import { useRoomTermination } from '@/lib/realtime/useRoomTermination';
import { getMockPlayRoomState } from '@/lib/fixtures';
import { getMockConfig } from '@/lib/mock';
import ControllerTimeline from './ControllerTimeline';
import ControllerHand from './ControllerHand';
import RevealButton from './RevealButton';

const formatTimer = (seconds: number | null) => {
  if (seconds === null) {
    return '--';
  }
  return `${Math.max(0, seconds)}s`;
};

export default function PlayerGamePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMock, mockState, mockQuery } = getMockConfig(searchParams);
  const roomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const kickTimeoutRef = useRef<number | null>(null);
  const revealPendingRef = useRef(false);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedTurnRemainingMs, setPausedTurnRemainingMs] = useState<number | null>(null);
  const [status, setStatus] = useState('Connecting to game...');
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Card[]>([]);
  const [placementIndex, setPlacementIndex] = useState<number | null>(null);
  const [reveal, setReveal] = useState<TurnReveal | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const [helpDismissed, setHelpDismissed] = useState(false);

  const redirectToPlay = useCallback(
    () => router.replace(isMock ? `/play${mockQuery}` : '/play'),
    [isMock, mockQuery, router]
  );
  const helpKey = roomCode ? getControllerHelpKey(roomCode) : null;

  const { handleTermination, terminatedRef, clearRedirectTimeout } = useRoomTermination({
    role: 'player',
    roomCode,
    isMock,
    onTerminateNow: () => {
      if (kickTimeoutRef.current !== null) {
        window.clearTimeout(kickTimeoutRef.current);
        kickTimeoutRef.current = null;
      }
      revealPendingRef.current = false;
      setReveal(null);
      setRevealBusy(false);
      setPlacementIndex(null);
      setTurnExpiresAt(null);
      setIsPaused(false);
      setPausedTurnRemainingMs(null);
      setRoom((prev) => (prev ? { ...prev, phase: 'END' } : prev));
      socketRef.current?.disconnect();
    },
    onRedirect: redirectToPlay,
    onStatus: setStatus,
    onClearError: () => setError(null),
  });

  useEffect(() => {
    if (isMock) {
      setIsPhone(true);
      return;
    }
    setIsPhone(isPhoneDevice(navigator.userAgent));
  }, [isMock]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add('player-game-locked');
    body.classList.add('player-game-locked');
    return () => {
      root.classList.remove('player-game-locked');
      body.classList.remove('player-game-locked');
    };
  }, []);

  useEffect(() => {
    const storedId = getPlayerId();
    if (storedId) {
      setPlayerId(storedId);
      playerIdRef.current = storedId;
    }
  }, []);

  useEffect(() => {
    if (playerId) {
      playerIdRef.current = playerId;
    }
  }, [playerId]);

  useEffect(() => {
    if (!helpKey || typeof window === 'undefined') {
      return;
    }
    const dismissed = window.localStorage.getItem(helpKey) === 'true';
    setHelpDismissed(dismissed);
  }, [helpKey]);

  useEffect(() => {
    if (!reveal || helpDismissed || !helpKey) {
      return;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(helpKey, 'true');
    }
    setHelpDismissed(true);
  }, [helpDismissed, helpKey, reveal]);

  useEffect(() => {
    if (isPaused) {
      if (pausedTurnRemainingMs === null) {
        setRemainingSeconds(null);
        return;
      }
      setRemainingSeconds(Math.max(0, Math.ceil(pausedTurnRemainingMs / 1000)));
      return;
    }
    if (!turnExpiresAt) {
      setRemainingSeconds(null);
      return;
    }

    const updateTimer = () => {
      const remainingMs = turnExpiresAt - Date.now();
      setRemainingSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [turnExpiresAt, isPaused, pausedTurnRemainingMs]);

  useEffect(() => {
    if (!roomCode || isPhone === null) {
      return;
    }
    if (terminatedRef.current) {
      return;
    }

    if (isMock) {
      const mock = getMockPlayRoomState(mockState);
      const storedName = getPlayerName();
      const storedId = getPlayerId();
      const playerNameValue = storedName ?? mock.playerName;
      const playerIdValue = storedId ?? mock.playerId;
      const activePlayerIdValue =
        mock.activePlayerId === mock.playerId ? playerIdValue : mock.activePlayerId;
      const players = mock.room.players.map((player) =>
        player.id === mock.playerId
          ? { ...player, id: playerIdValue, name: playerNameValue }
          : player
      );
      const updatedRoom = {
        ...mock.room,
        code: roomCode ?? mock.room.code,
        activePlayerId: activePlayerIdValue,
        players,
      };
      setRoom(updatedRoom);
      roomRef.current = updatedRoom;
      setActivePlayerId(activePlayerIdValue ?? null);
      setTurnExpiresAt(mock.turnExpiresAt);
      setIsPaused(mock.room.isPaused ?? false);
      setPausedTurnRemainingMs(mock.room.pausedTurnRemainingMs ?? null);
      setStatus(mock.status);
      setError(mock.error);
      setPlayerId(playerIdValue);
      playerIdRef.current = playerIdValue;
      setTimeline(mock.timeline);
      setPlacementIndex(mock.placementIndex);
      setReveal(mock.reveal);
      return;
    }

    if (!isPhone) {
      setError('Please join from a phone.');
      return;
    }

    const token = getSessionTokenForRole('player');
    if (!token) {
      setError('Missing player session. Return to /play to join.');
      return;
    }

    const storedRoom = getSessionRoomCodeForRole('player');
    if (storedRoom && storedRoom !== roomCode) {
      setError('Session is for a different room. Return to /play to join.');
      return;
    }

    const socket = createSocket();
    socketRef.current = socket;

    socket.on(SERVER_TO_CLIENT_EVENTS.ROOM_SNAPSHOT, (snapshot: RoomSnapshot) => {
      roomRef.current = snapshot;
      setRoom(snapshot);
      setActivePlayerId(snapshot.activePlayerId ?? null);
      setTurnExpiresAt(snapshot.turnExpiresAt ?? null);
      setIsPaused(snapshot.isPaused);
      setPausedTurnRemainingMs(snapshot.pausedTurnRemainingMs ?? null);
      if (snapshot.phase === 'LOBBY') {
        router.replace(`/play/${roomCode}/lobby`);
      }
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.TURN_DEALT, (payload: TurnDealtPayload) => {
      setActivePlayerId(payload.activePlayerId);
      setTurnExpiresAt(payload.expiresAt);
      setReveal(null);
      setPlacementIndex(null);
      setRevealBusy(false);
      revealPendingRef.current = false;
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.TURN_DEALT_PLAYER, (payload: TurnDealtPlayerPayload) => {
      setTimeline(payload.timeline);
      setReveal(null);
      setPlacementIndex(null);
      setActivePlayerId(payload.activePlayerId);
      setStatus('Your turn! Place the mystery card.');
      setRevealBusy(false);
      revealPendingRef.current = false;
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.TURN_PLACED, (payload: TurnPlacedPayload) => {
      if (payload.playerId === playerIdRef.current) {
        setPlacementIndex(payload.placementIndex);
      }
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.TURN_REMOVED, (payload: TurnRemovedPayload) => {
      if (payload.playerId === playerIdRef.current) {
        setPlacementIndex(null);
      }
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.TURN_REVEAL, (payload: TurnReveal) => {
      if (payload.playerId === playerIdRef.current) {
        setReveal(payload);
        setTimeline(payload.timeline);
        setPlacementIndex(null);
        setRevealBusy(false);
        revealPendingRef.current = false;
      }
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.GAME_ENDED, (payload: GameEndedPayload) => {
      if (payload.winnerId) {
        const winner = roomRef.current?.players.find((player) => player.id === payload.winnerId);
        setStatus(`Game ended. Winner: ${winner?.name ?? payload.winnerId}.`);
      } else {
        setStatus(`Game ended (${payload.reason}).`);
      }
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.GAME_TERMINATED, (payload: GameTerminationPayload) => {
      handleTermination(payload);
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.PLAYER_KICKED, () => {
      clearRoomSessionForRole('player', roomCode);
      setError('You were removed by the host.');
      if (kickTimeoutRef.current !== null) {
        window.clearTimeout(kickTimeoutRef.current);
      }
      kickTimeoutRef.current = window.setTimeout(() => {
        redirectToPlay();
      }, 1500);
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.ROOM_CLOSED, (payload: RoomClosedPayload) => {
      setError(`Room closed: ${payload?.reason ?? 'unknown'}`);
      clearRoomSessionForRole('player', roomCode);
      redirectToPlay();
    });

    socket.on('disconnect', () => {
      if (terminatedRef.current) {
        return;
      }
      setStatus('Disconnected from server.');
      setError('Connection lost. Try rejoining.');
    });

    socket.emit(
      CLIENT_TO_SERVER_EVENTS.PLAYER_RESUME,
      { playerSessionToken: token },
      (response: AckResponse<PlayerResumeAck>) => {
      if (response.ok) {
        return;
      }
      if (response.code === ACK_ERROR_CODES.KICKED) {
        clearSessionForRole('player');
        setError('You were removed by the host.');
        redirectToPlay();
        return;
      }
      if (response.code === ACK_ERROR_CODES.ROOM_TERMINATED) {
        handleTermination({ reason: 'HOST_ENDED', terminatedAt: Date.now() });
        return;
      }
      if (
        response.code === ACK_ERROR_CODES.SESSION_NOT_FOUND ||
        response.code === ACK_ERROR_CODES.ROOM_NOT_FOUND
      ) {
        clearRoomSessionForRole('player', roomCode);
        redirectToPlay();
        return;
      }
      if (response.code === ACK_ERROR_CODES.NON_MOBILE_DEVICE) {
        clearRoomSessionForRole('player', roomCode);
        setError('Please join from a phone.');
        return;
      }
      setError(response.message ?? 'Unable to resume player session.');
      }
    );

    return () => {
      if (kickTimeoutRef.current !== null) {
        window.clearTimeout(kickTimeoutRef.current);
      }
      clearRedirectTimeout();
      socket.disconnect();
    };
  }, [
    clearRedirectTimeout,
    handleTermination,
    isMock,
    mockQuery,
    mockState,
    isPhone,
    redirectToPlay,
    roomCode,
    router,
    terminatedRef,
  ]);

  const isActive = Boolean(
    playerId &&
    activePlayerId &&
    playerId === activePlayerId &&
    room?.phase !== 'LOBBY' &&
    room?.phase !== 'END'
  );
  const isInteractive = isActive && !reveal && !isPaused;

  const pauseOverlay = isPaused ? (
    <div className="game-pause-overlay blocking" role="status" aria-live="polite">
      <div className="game-pause-card">Game paused</div>
    </div>
  ) : null;

  const activePlayerName = useMemo(() => {
    if (!room || !activePlayerId) {
      return null;
    }
    return room.players.find((player) => player.id === activePlayerId)?.name ?? null;
  }, [activePlayerId, room]);

  const placeAt = (index: number) => {
    if (!isInteractive) {
      return;
    }
    const socket = socketRef.current;
    setPlacementIndex(index);
    if (!socket) {
      return;
    }
    socket.emit(CLIENT_TO_SERVER_EVENTS.TURN_PLACE, { placementIndex: index }, (response: AckResponse) => {
      if (!response.ok) {
        setError(response.message ?? 'Unable to place card.');
      }
    });
  };

  const removePlacement = () => {
    if (!isInteractive) {
      return;
    }
    const socket = socketRef.current;
    setPlacementIndex(null);
    if (!socket) {
      return;
    }
    socket.emit(CLIENT_TO_SERVER_EVENTS.TURN_REMOVE, {}, (response: AckResponse) => {
      if (!response.ok) {
        setError(response.message ?? 'Unable to remove placement.');
      }
    });
  };

  const revealTurn = () => {
    if (!isInteractive || placementIndex === null || revealPendingRef.current) {
      return;
    }
    const socket = socketRef.current;
    revealPendingRef.current = true;
    setRevealBusy(true);
    if (!socket) {
      setRevealBusy(false);
      revealPendingRef.current = false;
      return;
    }
    socket.emit(CLIENT_TO_SERVER_EVENTS.TURN_REVEAL, {}, (response: AckResponse) => {
      if (!response.ok) {
        setError(response.message ?? 'Unable to reveal.');
        setRevealBusy(false);
        revealPendingRef.current = false;
      }
    });
  };

  if (isPhone === false) {
    return (
      <div className="container">
        <section className="card">
          <h1 className="title">Join a Backtrack room</h1>
          <p className="subtitle">Players must join from a phone.</p>
        </section>
        <div className="status bad">Please join from a phone.</div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="controller-shell">
        {pauseOverlay}
        <header className="controller-header">
          <div className="controller-wordmark">Backtrack</div>
        </header>
        <div className="controller-status-row">
          <div className={`controller-timer ${remainingSeconds !== null && remainingSeconds <= 5 ? 'urgent' : ''}`}>
            {formatTimer(remainingSeconds)}
          </div>
        </div>
        {error ? <div className="controller-status bad">{error}</div> : null}
        {status ? <div className="controller-status">{status}</div> : null}
        <div className="controller-status">
          {room?.phase === 'LOBBY'
            ? 'Waiting for host to start.'
            : activePlayerName
              ? `${activePlayerName}'s turn.`
              : 'Turn in progress.'}
        </div>
      </div>
    );
  }

  return (
    <div className="controller-shell">
      {pauseOverlay}
      <header className="controller-header">
        <div className="controller-wordmark">Backtrack</div>
      </header>
      <div className="controller-status-row">
        <div className={`controller-timer ${remainingSeconds !== null && remainingSeconds <= 5 ? 'urgent' : ''}`}>
          {formatTimer(remainingSeconds)}
        </div>
      </div>

      {error ? <div className="controller-status bad">{error}</div> : null}

      <div className="controller-body">
        <ControllerTimeline
          timeline={timeline}
          placementIndex={placementIndex}
          onPlace={placeAt}
          onRemove={removePlacement}
          disabled={!isInteractive}
        />

        <ControllerHand placementIndex={placementIndex} />
      </div>

      <div className="controller-actions">
        <RevealButton
          visible={placementIndex !== null}
          disabled={!isInteractive || revealBusy}
          onReveal={revealTurn}
        />
        {reveal ? (
          <div className={`controller-reveal-result ${reveal.correct ? 'good' : 'bad'}`}>
            {reveal.correct ? 'Correct placement!' : 'Incorrect placement.'} {reveal.card.title} —{' '}
            {reveal.card.artist} ({reveal.card.year})
          </div>
        ) : null}
      </div>
    </div>
  );
}
