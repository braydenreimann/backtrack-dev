'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  turnNumber: number;
  turnExpiresAt: number | null;
  host: { connected: boolean };
  players: RoomPlayer[];
};

type TurnDealtHost = {
  activePlayerId: string;
  turnNumber: number;
  card: Card;
  timelines: Array<{ playerId: string; timeline: Card[] }>;
};

type GameStarted = {
  turnOrder: string[];
  activePlayerId: string | null;
  turnNumber: number;
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

type TimelineItem = {
  key: string;
  card: Card | null;
  faceDown: boolean;
  highlight?: 'good' | 'bad';
  isCurrent: boolean;
};

const TURN_DURATION_SECONDS = 40;

const formatSeconds = (seconds: number | null) => {
  if (seconds === null) {
    return '--';
  }
  return `${Math.max(0, seconds)}s`;
};

export default function HostGamePage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lookupIdRef = useRef(0);
  const revealTimerRef = useRef<number | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<string>('Connecting to game...');
  const [error, setError] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [timelines, setTimelines] = useState<Record<string, Card[]>>({});
  const [tentativePlacementIndex, setTentativePlacementIndex] = useState<number | null>(null);
  const [reveal, setReveal] = useState<TurnReveal | null>(null);
  const [revealDisplay, setRevealDisplay] = useState<TurnReveal | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'blocked' | 'unavailable'>(
    'idle'
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const stopPreview = useCallback((resetState = true) => {
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
    }
  }, []);

  const attemptPlay = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    try {
      await audio.play();
      setIsPlaying(true);
      setPreviewState('ready');
    } catch {
      setPreviewState('blocked');
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

  const startPreview = useCallback(async (card: Card) => {
    stopPreview();
    const lookupId = lookupIdRef.current + 1;
    lookupIdRef.current = lookupId;
    setPreviewState('loading');

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
      } catch {
        setIsPlaying(false);
        setPreviewState('blocked');
      }
    } catch {
      if (lookupIdRef.current !== lookupId) {
        return;
      }
      setPreviewState('unavailable');
    }
  }, [stopPreview]);

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

    socket.on('turn.dealt', (payload: { activePlayerId: string; turnNumber: number; expiresAt: number }) => {
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
      setStatus('');
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
  }, [roomCode, router, startPreview, stopPreview]);

  useEffect(() => {
    if (!room) {
      return;
    }
    if (room.phase === 'LOBBY') {
      router.replace(`/host/${roomCode}/lobby`);
    }
  }, [room, roomCode, router]);

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
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (!reveal || reveal.playerId !== activePlayerId) {
      setRevealDisplay(null);
      return;
    }
    setRevealDisplay(reveal);
    revealTimerRef.current = window.setTimeout(() => {
      setRevealDisplay(null);
      revealTimerRef.current = null;
    }, 1600);
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [reveal, activePlayerId]);

  const activePlayer = useMemo(
    () => room?.players.find((player) => player.id === activePlayerId) ?? null,
    [activePlayerId, room?.players]
  );

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const activeTimeline = activePlayerId ? timelines[activePlayerId] ?? [] : [];
    const items: TimelineItem[] = [];
    const revealForActive = revealDisplay && revealDisplay.playerId === activePlayerId ? revealDisplay : null;
    const placementIndex =
      revealForActive?.placementIndex ?? (tentativePlacementIndex ?? null);
    const current = revealForActive?.card ?? currentCard;
    const showCurrent = current && placementIndex !== null;
    const highlight = revealForActive
      ? revealForActive.correct
        ? 'good'
        : 'bad'
      : undefined;
    const faceDown = !revealForActive;

    const baseTimeline = [...activeTimeline];
    if (revealForActive?.correct && placementIndex !== null && placementIndex < baseTimeline.length) {
      baseTimeline.splice(placementIndex, 1);
    }

    baseTimeline.forEach((card, index) => {
      if (showCurrent && placementIndex === index && current) {
        items.push({
          key: 'current-card',
          card: current,
          faceDown,
          highlight,
          isCurrent: true,
        });
      }
      items.push({
        key: `${card.title}-${card.artist}-${card.year}-${index}`,
        card,
        faceDown: false,
        isCurrent: false,
      });
    });

    if (showCurrent && placementIndex !== null && placementIndex >= baseTimeline.length && current) {
      items.push({
        key: 'current-card',
        card: current,
        faceDown,
        highlight,
        isCurrent: true,
      });
    }

    return items;
  }, [activePlayerId, currentCard, revealDisplay, tentativePlacementIndex, timelines]);

  const playerCount = room?.players.length ?? 0;
  const turnNumber = room?.turnNumber ?? 0;
  const roundNumber =
    playerCount > 0 ? Math.floor((Math.max(turnNumber, 1) - 1) / playerCount) + 1 : 1;
  const progressPct =
    remainingSeconds === null
      ? 0
      : Math.max(0, Math.min(100, (remainingSeconds / TURN_DURATION_SECONDS) * 100));

  return (
    <div className="host-game">
      <header className="host-game-header">
        <div className="host-brand">
          <div className="host-title">Backtrack</div>
          <div className="host-deck">Classic</div>
        </div>
        <div className="host-score-row">
          {(room?.players ?? []).map((player) => (
            <div
              key={player.id}
              className={`host-score-chip ${player.id === activePlayerId ? 'active' : ''} ${
                player.connected ? '' : 'disconnected'
              }`}
            >
              <div className="host-score-name">{player.name}</div>
              <div className="host-score-count">{player.cardCount}</div>
            </div>
          ))}
        </div>
      </header>

      <section className="host-turn">
        <div className="host-round">Round {roundNumber}</div>
        <div className="host-turn-name">
          {activePlayer ? `${activePlayer.name}'s turn` : 'Waiting for players'}
        </div>
      </section>

      <section className="timeline-stage">
        <div className="timeline-axis" />
        <div className="timeline-label left">Oldest</div>
        <div className="timeline-label right">Newest</div>
        <div className="timeline-strip hide-scroll">
          {timelineItems.length === 0 ? (
            <div className="status">Timeline will appear here on the first turn.</div>
          ) : (
            timelineItems.map((item) => (
              <div
                className={`timeline-card ${item.faceDown ? 'face-down' : ''} ${
                  item.highlight ? `reveal-${item.highlight}` : ''
                } ${item.isCurrent ? 'current' : ''}`}
                key={item.key}
              >
                <div className="timeline-card-inner">
                  <div className="timeline-card-face front">
                    {item.card ? (
                      <>
                        <div className="timeline-card-year">{item.card.year}</div>
                        <div className="timeline-card-title">{item.card.title}</div>
                        <div className="timeline-card-artist">{item.card.artist}</div>
                      </>
                    ) : (
                      <div className="timeline-card-year">????</div>
                    )}
                  </div>
                  <div className="timeline-card-face back">
                    <div className="timeline-card-mystery">?</div>
                    <div className="timeline-card-label">Mystery</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {revealDisplay ? (
          <div className={`host-reveal ${revealDisplay.correct ? 'good' : 'bad'}`}>
            <span>{revealDisplay.correct ? 'Correct!' : 'Incorrect'}</span>
            <span>
              {revealDisplay.card.title} — {revealDisplay.card.artist} ({revealDisplay.card.year})
            </span>
          </div>
        ) : null}
      </section>

      <section className="host-timer">
        <div className="host-timer-text">Time: {formatSeconds(remainingSeconds)}</div>
        <div className="host-timer-track">
          <div className="host-timer-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {room?.phase !== 'LOBBY' ? (
          <div className="host-audio">
            {previewState === 'loading' ? <div className="status">Searching iTunes preview...</div> : null}
            {previewState === 'unavailable' ? (
              <div className="status bad">Preview unavailable - continue without audio</div>
            ) : null}
            {previewState === 'blocked' ? (
              <button className="button small" onClick={attemptPlay}>
                Tap to Play Preview
              </button>
            ) : null}
            {previewUrl && previewState === 'ready' ? (
              <button className="button secondary small" onClick={togglePlay}>
                {isPlaying ? 'Pause preview' : 'Play preview'}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {status ? <div className="status">{status}</div> : null}
      {error ? <div className="status bad">{error}</div> : null}
    </div>
  );
}
