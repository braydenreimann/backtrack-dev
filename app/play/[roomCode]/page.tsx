'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
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

type Card = {
  title: string;
  artist: string;
  year: number;
};

type RoomSnapshot = {
  code: string;
  seq: number;
  phase: string;
  activePlayerId: string | null;
  turnExpiresAt: number | null;
  players: Array<{ id: string; name: string; connected: boolean; cardCount: number }>;
};

type TurnDealtPlayer = {
  activePlayerId: string;
  timeline: Card[];
};

type TurnPlaced = {
  playerId: string;
  placementIndex: number;
};

type TurnReveal = {
  playerId: string;
  card: Card;
  correct: boolean;
  placementIndex: number;
  timeline: Card[];
};

type GameStarted = {
  turnOrder: string[];
  activePlayerId: string | null;
  timelines: Array<{ playerId: string; timeline: Card[] }>;
};

type AckOk = { ok: true } & Record<string, unknown>;

type AckErr = { ok: false; code: string; message: string };

type AckResponse = AckOk | AckErr;

const formatTimer = (seconds: number | null) => {
  if (seconds === null) {
    return '--';
  }
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = `${clamped % 60}`.padStart(2, '0');
  return `${mins}:${secs}`;
};

export default function PlayRoomPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMock, mockState, mockQuery } = getMockConfig(searchParams);
  const roomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const kickedRef = useRef(false);
  const kickTimeoutRef = useRef<number | null>(null);
  const lockTimeoutRef = useRef<number | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [status, setStatus] = useState('Connecting to room...');
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [playerName, setPlayerName] = useState('Player');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Card[]>([]);
  const [placementIndex, setPlacementIndex] = useState<number | null>(null);
  const [reveal, setReveal] = useState<TurnReveal | null>(null);
  const [lockHolding, setLockHolding] = useState(false);
  const kickMessage = 'You were removed by the host.';

  const redirectToPlay = useCallback(
    () => router.replace(isMock ? `/play${mockQuery}` : '/play'),
    [isMock, mockQuery, router]
  );
  const showKickAndRedirect = useCallback(() => {
    kickedRef.current = true;
    setKicked(true);
    clearPlayerSession();
    setError(kickMessage);
    if (kickTimeoutRef.current !== null) {
      window.clearTimeout(kickTimeoutRef.current);
    }
    kickTimeoutRef.current = window.setTimeout(() => {
      redirectToPlay();
    }, 1500);
  }, [redirectToPlay]);

  useEffect(() => {
    if (isMock) {
      setIsPhone(true);
      return;
    }
    setIsPhone(isPhoneDevice(navigator.userAgent));
  }, [isMock]);

  useEffect(() => {
    const name = getPlayerName();
    if (name) {
      setPlayerName(name);
    }
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
      setRoom({
        ...mock.room,
        code: roomCode ?? mock.room.code,
        activePlayerId: activePlayerIdValue,
        players,
      });
      setActivePlayerId(activePlayerIdValue ?? null);
      setTurnExpiresAt(mock.turnExpiresAt);
      setStatus(mock.status);
      setError(mock.error);
      setPlayerName(playerNameValue);
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
      setRoom(snapshot);
      setActivePlayerId(snapshot.activePlayerId ?? null);
      setTurnExpiresAt(snapshot.turnExpiresAt ?? null);
      if (snapshot.phase === 'LOBBY') {
        setStatus('Waiting for host to start...');
      }
    });

    socket.on('turn.dealt', (payload: { activePlayerId: string; expiresAt: number }) => {
      setActivePlayerId(payload.activePlayerId);
      setTurnExpiresAt(payload.expiresAt);
      setReveal(null);
      setPlacementIndex(null);
    });

    socket.on('turn.dealt.player', (payload: TurnDealtPlayer) => {
      setTimeline(payload.timeline);
      setReveal(null);
      setPlacementIndex(0);
      setActivePlayerId(payload.activePlayerId);
      setStatus('Your turn! Place the mystery card.');
      const socketRefValue = socketRef.current;
      if (socketRefValue) {
        socketRefValue.emit('turn.place', { placementIndex: 0 }, () => {});
      }
    });

    socket.on('game.started', (payload: GameStarted) => {
      setActivePlayerId(payload.activePlayerId);
      const entry = payload.timelines.find((item) => item.playerId === playerIdRef.current);
      if (entry) {
        setTimeline(entry.timeline);
      }
      setStatus('Game started.');
    });

    socket.on('turn.placed', (payload: TurnPlaced) => {
      if (payload.playerId === playerIdRef.current) {
        setPlacementIndex(payload.placementIndex);
      }
    });

    socket.on('turn.reveal', (payload: TurnReveal) => {
      if (payload.playerId === playerIdRef.current) {
        setReveal(payload);
        setTimeline(payload.timeline);
        setPlacementIndex(null);
      }
    });

    socket.on('player.kicked', () => {
      showKickAndRedirect();
    });

    socket.on('room.closed', (payload: { reason: string }) => {
      setError(`Room closed: ${payload?.reason ?? 'unknown'}`);
      clearPlayerSession();
      redirectToPlay();
    });

    socket.on('disconnect', () => {
      if (kickedRef.current) {
        return;
      }
      setStatus('Disconnected from server.');
      setError('Connection lost. Try rejoining.');
    });

    socket.emit('player.resume', { playerSessionToken: token }, (response: AckResponse) => {
      if (response.ok) {
        return;
      }
      if (response.code === 'KICKED') {
        showKickAndRedirect();
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
      if (lockTimeoutRef.current !== null) {
        window.clearTimeout(lockTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, [isMock, mockState, isPhone, roomCode, redirectToPlay, showKickAndRedirect]);

  const isActive = Boolean(
    playerId &&
      activePlayerId &&
      playerId === activePlayerId &&
      room?.phase !== 'LOBBY' &&
      room?.phase !== 'END'
  );

  const activePlayerName = useMemo(() => {
    if (!room || !activePlayerId) {
      return null;
    }
    return room.players.find((player) => player.id === activePlayerId)?.name ?? null;
  }, [activePlayerId, room]);

  const listRows = useMemo(() => {
    if (placementIndex === null) {
      return timeline.map((card, index) => ({
        key: `card-${index}`,
        type: 'card' as const,
        card,
        slotIndex: index,
      }));
    }
    const rows: Array<
      | { key: string; type: 'card'; card: Card; slotIndex: number }
      | { key: string; type: 'mystery'; slotIndex: number }
    > = [];
    timeline.forEach((card, index) => {
      if (index === placementIndex) {
        rows.push({ key: `mystery-${index}`, type: 'mystery', slotIndex: index });
      }
      rows.push({ key: `card-${index}`, type: 'card', card, slotIndex: index });
    });
    if (placementIndex === timeline.length) {
      rows.push({ key: `mystery-end`, type: 'mystery', slotIndex: timeline.length });
    }
    return rows;
  }, [placementIndex, timeline]);

  const placeAt = (index: number) => {
    const socket = socketRef.current;
    if (!socket) {
      if (isMock) {
        setPlacementIndex(index);
      }
      return;
    }
    setPlacementIndex(index);
    socket.emit('turn.place', { placementIndex: index }, (response: AckResponse) => {
      if (!response.ok) {
        setError(response.message ?? 'Unable to place card.');
      }
    });
  };

  const startLock = () => {
    if (!isActive || placementIndex === null) {
      setError('Place the mystery card before locking.');
      return;
    }
    if (lockTimeoutRef.current !== null) {
      return;
    }
    setLockHolding(true);
    lockTimeoutRef.current = window.setTimeout(() => {
      const socket = socketRef.current;
      if (socket) {
        socket.emit('turn.lock', {}, (response: AckResponse) => {
          if (!response.ok) {
            setError(response.message ?? 'Unable to lock.');
          }
        });
      }
      setLockHolding(false);
      lockTimeoutRef.current = null;
    }, 1000);
  };

  const cancelLock = () => {
    if (lockTimeoutRef.current !== null) {
      window.clearTimeout(lockTimeoutRef.current);
      lockTimeoutRef.current = null;
    }
    setLockHolding(false);
  };

  const handleRowDragStart = (event: DragEvent<HTMLDivElement>) => {
    const indexValue = Number(event.currentTarget.dataset.slotIndex ?? '0');
    if (!Number.isNaN(indexValue)) {
      setPlacementIndex(indexValue);
    }
  };

  const handleRowDrop = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const indexValue = Number(event.currentTarget.dataset.slotIndex ?? '0');
    if (!Number.isNaN(indexValue)) {
      placeAt(indexValue);
    }
  };

  const leaveLobby = () => {
    if (isMock) {
      clearPlayerSession();
      redirectToPlay();
      return;
    }
    const socket = socketRef.current;
    if (!socket) {
      clearPlayerSession();
      redirectToPlay();
      return;
    }
    setLeaving(true);
    socket.emit('room.leave', {}, (response: AckResponse) => {
      if (response.ok) {
        clearPlayerSession();
        redirectToPlay();
        return;
      }
      setLeaving(false);
      setError(response.message ?? 'Unable to leave the lobby.');
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

  return (
    <div className="container play-layout">
      <section className="card">
        <h1 className="title">Room {roomCode}</h1>
        <p className="subtitle">You are connected as {playerName}.</p>
      </section>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="status">Timer: {formatTimer(remainingSeconds)}</div>
        {room?.phase === 'LOBBY' ? (
          <button className="button secondary" onClick={leaveLobby} disabled={leaving || kicked}>
            {leaving ? 'Leaving...' : 'Leave lobby'}
          </button>
        ) : null}
      </div>
      {status ? <div className="status">{status}</div> : null}
      {error ? <div className="status bad">{error}</div> : null}

      {!isActive ? (
        <section className="card center">
          <div className="status">Watching the host screen.</div>
          <div className="status" style={{ marginTop: '12px' }}>
            {room?.phase === 'LOBBY'
              ? 'Waiting for host to start.'
              : activePlayerName
                ? `${activePlayerName}'s turn.`
                : 'Turn in progress.'}
          </div>
        </section>
      ) : (
        <section className="card">
          <h2 className="title" style={{ fontSize: '1.35rem' }}>
            Place your mystery card
          </h2>
          <p className="subtitle">Drag the mystery row, or tap a row to place it.</p>

          <div
            className="list-stack"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              if (event.target === event.currentTarget) {
                placeAt(timeline.length);
              }
            }}
          >
            {listRows.map((row) =>
              row.type === 'mystery' ? (
                <div
                  key={row.key}
                  className="list-row mystery"
                  draggable
                  data-slot-index={row.slotIndex}
                  onDragStart={handleRowDragStart}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleRowDrop}
                  onClick={() => placeAt(row.slotIndex)}
                >
                  <div className="list-detail">Song Year</div>
                  <div className="list-main">
                    <div className="list-title">Song Title</div>
                    <div className="list-subtitle">Artist</div>
                  </div>
                </div>
              ) : (
                <div
                  key={row.key}
                  className="list-row"
                  draggable
                  data-slot-index={row.slotIndex}
                  onDragStart={handleRowDragStart}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleRowDrop}
                  onClick={() => placeAt(row.slotIndex)}
                >
                  <div className="list-detail">{row.card.year}</div>
                  <div className="list-main">
                    <div className="list-title">{row.card.title}</div>
                    <div className="list-subtitle">{row.card.artist}</div>
                  </div>
                </div>
              )
            )}
            <button
              className="list-tail"
              type="button"
              onClick={() => placeAt(timeline.length)}
            >
              Place at end
            </button>
          </div>

          <button
            className={`button lock ${lockHolding ? 'holding' : ''}`}
            onPointerDown={startLock}
            onPointerUp={cancelLock}
            onPointerLeave={cancelLock}
            onPointerCancel={cancelLock}
          >
            {lockHolding ? 'Hold to lock...' : 'Hold to lock'}
          </button>

          {reveal ? (
            <div className={`reveal-banner ${reveal.correct ? 'good' : 'bad'}`}>
              <div className="reveal-title">
                {reveal.correct ? 'Correct!' : 'Incorrect'}
              </div>
              <div className="reveal-meta">
                {reveal.card.title} — {reveal.card.artist} ({reveal.card.year})
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
