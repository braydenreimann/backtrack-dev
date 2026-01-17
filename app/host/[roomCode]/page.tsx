'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import { clearHostSession, getHostRoomCode, getHostSessionToken } from '@/lib/storage';

type Card = {
  title: string;
  artist: string;
  year: number;
};

type RoomPlayer = {
  id: string;
  name: string;
  connected: boolean;
  cardCount: number;
};

type RoomSnapshot = {
  code: string;
  seq: number;
  phase: string;
  activePlayerId: string | null;
  turnExpiresAt: number | null;
  host: { connected: boolean };
  players: RoomPlayer[];
};

type TurnDealtHost = {
  activePlayerId: string;
  card: Card;
  timelines: Array<{ playerId: string; timeline: Card[] }>;
};

type GameStarted = {
  turnOrder: string[];
  activePlayerId: string | null;
  timelines: Array<{ playerId: string; timeline: Card[] }>;
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
  reason: string;
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

export default function HostRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lookupIdRef = useRef(0);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<string>('Connecting to lobby...');
  const [error, setError] = useState<string | null>(null);
  const [kickBusy, setKickBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [timelines, setTimelines] = useState<Record<string, Card[]>>({});
  const [tentativePlacementIndex, setTentativePlacementIndex] = useState<number | null>(null);
  const [reveal, setReveal] = useState<TurnReveal | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'blocked' | 'unavailable'>(
    'idle'
  );
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const stopPreview = (resetState = true) => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audio.load();
    }
    if (resetState) {
      setIsPlaying(false);
      setPreviewUrl(null);
      setPreviewState('idle');
      setPreviewMessage(null);
    }
  };

  const attemptPlay = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    try {
      await audio.play();
      setIsPlaying(true);
      setPreviewState('ready');
      setPreviewMessage(null);
    } catch {
      setPreviewState('blocked');
      setPreviewMessage('Tap to play preview');
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void attemptPlay();
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const startPreview = async (card: Card) => {
    stopPreview();
    const lookupId = lookupIdRef.current + 1;
    lookupIdRef.current = lookupId;
    setPreviewState('loading');
    setPreviewMessage('Searching iTunes preview...');

    const query = encodeURIComponent(`${card.title} ${card.artist}`);
    try {
      const response = await fetch(
        `https://itunes.apple.com/search?term=${query}&entity=song&limit=1`
      );
      const data = await response.json();
      if (lookupIdRef.current !== lookupId) {
        return;
      }
      const preview = data?.results?.[0]?.previewUrl as string | undefined;
      if (!preview) {
        setPreviewState('unavailable');
        setPreviewMessage('Preview unavailable - continue without audio');
        return;
      }
      setPreviewUrl(preview);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = preview;
      audio.currentTime = 0;
      audio.onended = () => setIsPlaying(false);
      try {
        await audio.play();
        setIsPlaying(true);
        setPreviewState('ready');
        setPreviewMessage(null);
      } catch {
        setIsPlaying(false);
        setPreviewState('blocked');
        setPreviewMessage('Tap to play preview');
      }
    } catch {
      if (lookupIdRef.current !== lookupId) {
        return;
      }
      setPreviewState('unavailable');
      setPreviewMessage('Preview unavailable - continue without audio');
    }
  };

  useEffect(() => {
    if (!roomCode) {
      return;
    }

    const hostSessionToken = getHostSessionToken();
    if (!hostSessionToken) {
      setError('Missing host session. Return to /host to create a room.');
      return;
    }

    const storedRoom = getHostRoomCode();
    if (storedRoom && storedRoom !== roomCode) {
      setStatus('Session room mismatch. Attempting to resume anyway.');
    }

    const socket = createSocket();
    socketRef.current = socket;

    socket.on('room.snapshot', (snapshot: RoomSnapshot) => {
      roomRef.current = snapshot;
      setRoom(snapshot);
      setActivePlayerId(snapshot.activePlayerId ?? null);
      setTurnExpiresAt(snapshot.turnExpiresAt ?? null);
      if (snapshot.phase === 'LOBBY') {
        setStatus('Lobby connected.');
      }
    });

    socket.on('turn.dealt', (payload: { activePlayerId: string; expiresAt: number }) => {
      setActivePlayerId(payload.activePlayerId);
      setTurnExpiresAt(payload.expiresAt);
      setTentativePlacementIndex(null);
      setReveal(null);
    });

    socket.on('game.started', (payload: GameStarted) => {
      const timelineMap: Record<string, Card[]> = {};
      payload.timelines.forEach((entry) => {
        timelineMap[entry.playerId] = entry.timeline;
      });
      setTimelines(timelineMap);
      setActivePlayerId(payload.activePlayerId);
      setStatus('Game started. Dealing first turns...');
    });

    socket.on('turn.dealt.host', (payload: TurnDealtHost) => {
      const timelineMap: Record<string, Card[]> = {};
      payload.timelines.forEach((entry) => {
        timelineMap[entry.playerId] = entry.timeline;
      });
      setTimelines(timelineMap);
      setCurrentCard(payload.card);
      setActivePlayerId(payload.activePlayerId);
      setTentativePlacementIndex(null);
      setReveal(null);
      void startPreview(payload.card);
    });

    socket.on('turn.placed', (payload: TurnPlaced) => {
      setTentativePlacementIndex(payload.placementIndex);
    });

    socket.on('turn.reveal', (payload: TurnReveal) => {
      setReveal(payload);
      setTimelines((prev) => ({
        ...prev,
        [payload.playerId]: payload.timeline,
      }));
      setTentativePlacementIndex(null);
      setCurrentCard(payload.card);
    });

    socket.on('turn.timeout', () => {
      setTentativePlacementIndex(null);
      setCurrentCard(null);
    });

    socket.on('game.ended', (payload: { winnerId?: string; reason: string }) => {
      if (payload.winnerId) {
        const winner = roomRef.current?.players.find((player) => player.id === payload.winnerId);
        setStatus(`Game ended. Winner: ${winner?.name ?? payload.winnerId}.`);
      } else {
        setStatus(`Game ended (${payload.reason}).`);
      }
      stopPreview();
    });

    socket.on('room.closed', (payload: { reason: string }) => {
      setError(`Room closed: ${payload?.reason ?? 'unknown'}`);
      stopPreview();
      clearHostSession();
      router.replace('/host');
    });

    socket.emit('host.resume', { hostSessionToken }, (response: AckResponse) => {
      if (response.ok) {
        return;
      }
      if (response.code === 'SESSION_NOT_FOUND' || response.code === 'ROOM_NOT_FOUND') {
        clearHostSession();
        setError('Host session expired. Create a new room.');
        router.replace('/host');
        return;
      }
      setError(response.message ?? 'Unable to resume host session.');
    });

    return () => {
      stopPreview(false);
      socket.disconnect();
    };
  }, [roomCode, router]);

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

  const kickPlayer = (playerId: string) => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    setKickBusy(playerId);
    socket.emit('kickPlayer', { playerId }, (response: AckResponse) => {
      if (!response.ok) {
        setError(response.message ?? 'Unable to kick player.');
      }
      setKickBusy(null);
    });
  };

  const deleteRoom = () => {
    if (!room || room.phase !== 'LOBBY') {
      setError('Room can only be deleted in the lobby.');
      return;
    }
    if (!window.confirm('Delete this room and remove all players?')) {
      return;
    }
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    setDeleteBusy(true);
    socket.emit('room.delete', {}, (response: AckResponse) => {
      if (response.ok) {
        clearHostSession();
        router.replace('/host');
        return;
      }
      setError(response.message ?? 'Unable to delete room.');
      setDeleteBusy(false);
    });
  };

  const startGame = () => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    setStartBusy(true);
    socket.emit('game.start', {}, (response: AckResponse) => {
      if (!response.ok) {
        setError(response.message ?? 'Unable to start game.');
        setStartBusy(false);
        return;
      }
      setStartBusy(false);
    });
  };

  const activePlayer = useMemo(
    () => room?.players.find((player) => player.id === activePlayerId) ?? null,
    [activePlayerId, room?.players]
  );

  const activeTimeline = activePlayerId ? timelines[activePlayerId] ?? [] : [];
  const timelineItems = useMemo(() => {
    if (tentativePlacementIndex === null || tentativePlacementIndex > activeTimeline.length) {
      return activeTimeline.map((card) => ({ type: 'card' as const, card }));
    }
    const items: Array<{ type: 'card'; card: Card } | { type: 'placeholder' }> = [];
    activeTimeline.forEach((card, index) => {
      if (index === tentativePlacementIndex) {
        items.push({ type: 'placeholder' });
      }
      items.push({ type: 'card', card });
    });
    if (tentativePlacementIndex === activeTimeline.length) {
      items.push({ type: 'placeholder' });
    }
    return items;
  }, [activeTimeline, tentativePlacementIndex]);

  return (
    <div className="container host-layout">
      <section className="card host-header">
        <div>
          <h1 className="title">Room {roomCode}</h1>
          <p className="subtitle">Phase: {room?.phase ?? 'Connecting...'}</p>
        </div>
        <div className="timer">{formatTimer(remainingSeconds)}</div>
      </section>

      {status ? <div className="status">{status}</div> : null}
      {error ? <div className="status bad">{error}</div> : null}

      <section className="card scoreboard">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="title" style={{ fontSize: '1.4rem' }}>
            Scoreboard
          </h2>
          <div className="row">
            <button
              className="button"
              onClick={startGame}
              disabled={startBusy || room?.phase !== 'LOBBY'}
            >
              {startBusy ? 'Starting...' : 'Start game'}
            </button>
            <button
              className="button danger"
              onClick={deleteRoom}
              disabled={deleteBusy || room?.phase !== 'LOBBY'}
            >
              {deleteBusy ? 'Deleting...' : 'Delete room'}
            </button>
          </div>
        </div>
        <div className="list">
          {(room?.players ?? []).length === 0 ? (
            <div className="status">No players yet. Share the room code.</div>
          ) : (
            room?.players.map((player) => (
              <div
                className={`list-item scoreboard-item ${
                  player.id === activePlayerId ? 'active' : ''
                }`}
                key={player.id}
              >
                <div>
                  <div className="score-name">{player.name}</div>
                  <div className="pill">{player.connected ? 'Connected' : 'Disconnected'}</div>
                </div>
                <div className="row">
                  <div className="score-count">{player.cardCount}</div>
                  <button
                    className="button danger"
                    onClick={() => kickPlayer(player.id)}
                    disabled={kickBusy === player.id || room?.phase !== 'LOBBY'}
                  >
                    {kickBusy === player.id ? 'Kicking...' : 'Kick'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card timeline-view">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="title" style={{ fontSize: '1.5rem' }}>
            {activePlayer ? `${activePlayer.name}'s Timeline` : 'Awaiting players'}
          </h2>
          {currentCard && room?.phase !== 'LOBBY' ? (
            <div className="pill">Mystery card ready</div>
          ) : null}
        </div>

        {room?.phase !== 'LOBBY' ? (
          <div className="audio-panel">
            <div className="pill">Host audio</div>
            {previewState === 'loading' ? <div className="status">Searching iTunes preview...</div> : null}
            {previewState === 'unavailable' ? (
              <div className="status bad">Preview unavailable - continue without audio</div>
            ) : null}
            {previewState === 'blocked' ? (
              <button className="button" onClick={attemptPlay}>
                Tap to Play Preview
              </button>
            ) : null}
            {previewUrl && previewState === 'ready' ? (
              <button className="button secondary" onClick={togglePlay}>
                {isPlaying ? 'Pause preview' : 'Play preview'}
              </button>
            ) : null}
          </div>
        ) : null}

        {timelineItems.length === 0 ? (
          <div className="status">Timeline will appear here on the first turn.</div>
        ) : (
          <div className="timeline-grid">
            {timelineItems.map((item, index) =>
              item.type === 'placeholder' ? (
                <div className="timeline-card placeholder" key={`mystery-${index}`}>
                  <div className="pill">Mystery card placement</div>
                </div>
              ) : (
                <div className="timeline-card" key={`${item.card.title}-${index}`}>
                  <div className="timeline-year">{item.card.year}</div>
                  <div className="timeline-title">{item.card.title}</div>
                  <div className="timeline-artist">{item.card.artist}</div>
                </div>
              )
            )}
          </div>
        )}

        {reveal ? (
          <div className={`reveal-banner ${reveal.correct ? 'good' : 'bad'}`}>
            <div className="reveal-title">
              {reveal.correct ? 'Correct placement!' : 'Incorrect placement'}
            </div>
            <div className="reveal-meta">
              {reveal.card.title} — {reveal.card.artist} ({reveal.card.year})
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
