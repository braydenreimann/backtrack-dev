'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import { isPhoneDevice } from '@/lib/device';
import {
  clearPlayerSession,
  getPlayerId,
  getPlayerName,
  getPlayerRoomCode,
  getPlayerSessionToken,
} from '@/lib/storage';
import { getMockPlayRoomState } from '@/lib/fixtures';
import { getMockConfig } from '@/lib/mock';
import type { Card, RoomSnapshot, TurnReveal } from '@/lib/game-types';
import ControllerTimeline from './components/ControllerTimeline';
import ControllerHand from './components/ControllerHand';
import RevealButton from './components/RevealButton';

type TurnDealtPlayer = {
  activePlayerId: string;
  timeline: Card[];
};

type TurnPlaced = {
  playerId: string;
  placementIndex: number;
};

type TurnRemoved = {
  playerId: string;
};

type AckOk = { ok: true } & Record<string, unknown>;

type AckErr = { ok: false; code: string; message: string };

type AckResponse = AckOk | AckErr;

const HELP_KEY = 'bt:controller-help-dismissed';

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
    if (typeof window === 'undefined') {
      return;
    }
    const dismissed = window.localStorage.getItem(HELP_KEY) === 'true';
    setHelpDismissed(dismissed);
  }, []);

  useEffect(() => {
    if (!reveal || helpDismissed) {
      return;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HELP_KEY, 'true');
    }
    setHelpDismissed(true);
  }, [helpDismissed, reveal]);

  useEffect(() => {
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
  }, [turnExpiresAt]);

  useEffect(() => {
    if (!roomCode || isPhone === null) {
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

    const token = getPlayerSessionToken();
    if (!token) {
      setError('Missing player session. Return to /play to join.');
      return;
    }

    const storedRoom = getPlayerRoomCode();
    if (storedRoom && storedRoom !== roomCode) {
      setError('Session is for a different room. Return to /play to join.');
      return;
    }

    const socket = createSocket();
    socketRef.current = socket;

    socket.on('room.snapshot', (snapshot: RoomSnapshot) => {
      roomRef.current = snapshot;
      setRoom(snapshot);
      setActivePlayerId(snapshot.activePlayerId ?? null);
      setTurnExpiresAt(snapshot.turnExpiresAt ?? null);
      if (snapshot.phase === 'LOBBY') {
        router.replace(`/play/${roomCode}/lobby`);
      }
    });

    socket.on('turn.dealt', (payload: { activePlayerId: string; expiresAt: number }) => {
      setActivePlayerId(payload.activePlayerId);
      setTurnExpiresAt(payload.expiresAt);
      setReveal(null);
      setPlacementIndex(null);
      setRevealBusy(false);
      revealPendingRef.current = false;
    });

    socket.on('turn.dealt.player', (payload: TurnDealtPlayer) => {
      setTimeline(payload.timeline);
      setReveal(null);
      setPlacementIndex(null);
      setActivePlayerId(payload.activePlayerId);
      setStatus('Your turn! Place the mystery card.');
      setRevealBusy(false);
      revealPendingRef.current = false;
    });

    socket.on('turn.placed', (payload: TurnPlaced) => {
      if (payload.playerId === playerIdRef.current) {
        setPlacementIndex(payload.placementIndex);
      }
    });

    socket.on('turn.removed', (payload: TurnRemoved) => {
      if (payload.playerId === playerIdRef.current) {
        setPlacementIndex(null);
      }
    });

    socket.on('turn.reveal', (payload: TurnReveal) => {
      if (payload.playerId === playerIdRef.current) {
        setReveal(payload);
        setTimeline(payload.timeline);
        setPlacementIndex(null);
        setRevealBusy(false);
        revealPendingRef.current = false;
      }
    });

    socket.on('game.ended', (payload: { winnerId?: string; reason: string }) => {
      if (payload.winnerId) {
        const winner = roomRef.current?.players.find((player) => player.id === payload.winnerId);
        setStatus(`Game ended. Winner: ${winner?.name ?? payload.winnerId}.`);
      } else {
        setStatus(`Game ended (${payload.reason}).`);
      }
    });

    socket.on('player.kicked', () => {
      clearPlayerSession();
      setError('You were removed by the host.');
      if (kickTimeoutRef.current !== null) {
        window.clearTimeout(kickTimeoutRef.current);
      }
      kickTimeoutRef.current = window.setTimeout(() => {
        redirectToPlay();
      }, 1500);
    });

    socket.on('room.closed', (payload: { reason: string }) => {
      setError(`Room closed: ${payload?.reason ?? 'unknown'}`);
      clearPlayerSession();
      redirectToPlay();
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected from server.');
      setError('Connection lost. Try rejoining.');
    });

    socket.emit('player.resume', { playerSessionToken: token }, (response: AckResponse) => {
      if (response.ok) {
        return;
      }
      if (response.code === 'KICKED') {
        clearPlayerSession();
        setError('You were removed by the host.');
        redirectToPlay();
        return;
      }
      if (response.code === 'SESSION_NOT_FOUND' || response.code === 'ROOM_NOT_FOUND') {
        clearPlayerSession();
        redirectToPlay();
        return;
      }
      if (response.code === 'NON_MOBILE_DEVICE') {
        clearPlayerSession();
        setError('Please join from a phone.');
        return;
      }
      setError(response.message ?? 'Unable to resume player session.');
    });

    return () => {
      if (kickTimeoutRef.current !== null) {
        window.clearTimeout(kickTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, [isMock, mockQuery, mockState, isPhone, redirectToPlay, roomCode, router]);

  const isActive = Boolean(
    playerId &&
      activePlayerId &&
      playerId === activePlayerId &&
      room?.phase !== 'LOBBY' &&
      room?.phase !== 'END'
  );
  const isInteractive = isActive && !reveal;

  const activePlayerName = useMemo(() => {
    if (!room || !activePlayerId) {
      return null;
    }
    return room.players.find((player) => player.id === activePlayerId)?.name ?? null;
  }, [activePlayerId, room]);

  const helperText = useMemo(() => {
    if (helpDismissed || !isInteractive) {
      return null;
    }
    if (placementIndex === null) {
      return 'Tap where your card belongs in the timeline.';
    }
    return 'Tap another slot to move your card. Tap your card to remove it.';
  }, [helpDismissed, isInteractive, placementIndex]);

  const placeAt = (index: number) => {
    if (!isInteractive) {
      return;
    }
    const socket = socketRef.current;
    setPlacementIndex(index);
    if (!socket) {
      return;
    }
    socket.emit('turn.place', { placementIndex: index }, (response: AckResponse) => {
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
    socket.emit('turn.remove', {}, (response: AckResponse) => {
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
    socket.emit('turn.reveal', {}, (response: AckResponse) => {
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
        <header className="controller-header">
          <div className="controller-wordmark">Backtrack</div>
          <div className={`controller-timer ${remainingSeconds !== null && remainingSeconds <= 5 ? 'urgent' : ''}`}>
            {formatTimer(remainingSeconds)}
          </div>
          <div />
        </header>
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
      <header className="controller-header">
        <div className="controller-wordmark">Backtrack</div>
        <div className={`controller-timer ${remainingSeconds !== null && remainingSeconds <= 5 ? 'urgent' : ''}`}>
          {formatTimer(remainingSeconds)}
        </div>
        <div />
      </header>

      {error ? <div className="controller-status bad">{error}</div> : null}

      <ControllerTimeline
        timeline={timeline}
        placementIndex={placementIndex}
        onPlace={placeAt}
        onRemove={removePlacement}
        disabled={!isInteractive}
      />

      <ControllerHand placementIndex={placementIndex} />

      {helperText ? <div className="controller-helper">{helperText}</div> : null}

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
