'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import {
  clearHostSession,
  clearRoomStorage,
  consumeRoomTermination,
  getHostRoomCode,
  getHostSessionToken,
  markRoomTerminated,
} from '@/lib/storage';
import { getMockHostGameState } from '@/lib/fixtures';
import { getMockConfig } from '@/lib/mock';
import { useFullscreen } from '@/lib/useFullscreen';
import HostHeader from './HostHeader';
import HostTurnBanner from './HostTurnBanner';
import TimelineStripAnimated from './TimelineStripAnimated';
import TurnTimer from './TurnTimer';
import AudioPreviewControls from './AudioPreviewControls';
import HostStatusBanners from './HostStatusBanners';
import {
  GAME_TERMINATE_EVENT,
  GAME_TERMINATED_EVENT,
  type Card,
  type GameTerminationPayload,
  type RoomSnapshot,
  type TimelineItem,
  type TurnReveal,
} from '@/lib/game-types';

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

type AckOk = { ok: true } & Record<string, unknown>;

type AckErr = { ok: false; code: string; message: string };

type AckResponse = AckOk | AckErr;

const TURN_DURATION_SECONDS = 40;
const REVEAL_DURATION_MS = 3000;
const REVEAL_FLIP_DURATION_MS = 700;
const REVEAL_EXIT_DURATION_MS = 500;
const REVEAL_EXIT_DELAY_MS = Math.max(0, REVEAL_DURATION_MS - REVEAL_EXIT_DURATION_MS);
const TERMINATION_REDIRECT_DELAY_MS = 1500;

export default function HostGamePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMock, mockState } = getMockConfig(searchParams);
  const roomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lookupIdRef = useRef(0);
  const revealTimerRef = useRef<number | null>(null);
  const revealContentTimerRef = useRef<number | null>(null);
  const revealExitTimerRef = useRef<number | null>(null);
  const pendingRevealRef = useRef<TurnReveal | null>(null);
  const terminationTimeoutRef = useRef<number | null>(null);
  const terminatedRef = useRef(false);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<string>('Connecting to game...');
  const [error, setError] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [timelines, setTimelines] = useState<Record<string, Card[]>>({});
  const [tentativePlacementIndex, setTentativePlacementIndex] = useState<number | null>(null);
  const [reveal, setReveal] = useState<TurnReveal | null>(null);
  const [revealDisplay, setRevealDisplay] = useState<TurnReveal | null>(null);
  const [revealContentVisible, setRevealContentVisible] = useState(false);
  const [revealExitActive, setRevealExitActive] = useState(false);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'blocked' | 'unavailable'>(
    'idle'
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEndGameConfirm, setShowEndGameConfirm] = useState(false);
  const [endGameBusy, setEndGameBusy] = useState(false);

  const {
    isFullscreen,
    isSupported: isFullscreenSupported,
    error: fullscreenError,
    toggleFullscreen,
    clearError: clearFullscreenError,
  } = useFullscreen(hostRef, { enableHotkeys: true });

  useEffect(() => {
    if (!fullscreenError) {
      return;
    }
    const timeout = window.setTimeout(() => clearFullscreenError(), 2400);
    return () => window.clearTimeout(timeout);
  }, [clearFullscreenError, fullscreenError]);

  const clearRevealState = useCallback(() => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (revealContentTimerRef.current !== null) {
      window.clearTimeout(revealContentTimerRef.current);
      revealContentTimerRef.current = null;
    }
    if (revealExitTimerRef.current !== null) {
      window.clearTimeout(revealExitTimerRef.current);
      revealExitTimerRef.current = null;
    }
    setRevealDisplay(null);
    setReveal(null);
    setRevealContentVisible(false);
    setRevealExitActive(false);
    pendingRevealRef.current = null;
  }, []);

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

  const handleTermination = useCallback(
    (
      payload: { reason: string; terminatedAt: number },
      options?: { persistMarker?: boolean }
    ) => {
      if (terminatedRef.current) {
        return;
      }
      if (roomCode) {
        if (options?.persistMarker !== false) {
          markRoomTerminated(roomCode, payload.reason, payload.terminatedAt);
        }
        clearRoomStorage(roomCode);
      } else {
        clearHostSession();
      }
      if (terminationTimeoutRef.current !== null) {
        window.clearTimeout(terminationTimeoutRef.current);
        terminationTimeoutRef.current = null;
      }
      terminatedRef.current = true;
      clearRevealState();
      stopPreview();
      setCurrentCard(null);
      setTentativePlacementIndex(null);
      setTurnExpiresAt(null);
      setActivePlayerId(null);
      setShowEndGameConfirm(false);
      setEndGameBusy(false);
      setError(null);
      setStatus('Game ended by host.');
      socketRef.current?.disconnect();
      terminationTimeoutRef.current = window.setTimeout(() => {
        router.replace('/host');
      }, TERMINATION_REDIRECT_DELAY_MS);
    },
    [clearRevealState, roomCode, router, stopPreview]
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

  const requestEndGame = () => {
    if (endGameBusy || terminatedRef.current) {
      return;
    }
    setShowEndGameConfirm(true);
  };

  const cancelEndGame = () => {
    if (endGameBusy) {
      return;
    }
    setShowEndGameConfirm(false);
  };

  const confirmEndGame = () => {
    if (endGameBusy) {
      return;
    }
    setEndGameBusy(true);
    if (isMock) {
      handleTermination({ reason: 'HOST_ENDED', terminatedAt: Date.now() });
      return;
    }
    const socket = socketRef.current;
    if (!socket) {
      setError('Unable to reach the game server.');
      setEndGameBusy(false);
      return;
    }
    socket.emit(GAME_TERMINATE_EVENT, { reason: 'HOST_ENDED' }, (response: AckResponse) => {
      if (!response.ok) {
        setError(response.message ?? 'Unable to end the game.');
        setEndGameBusy(false);
        return;
      }
      setShowEndGameConfirm(false);
      setEndGameBusy(false);
    });
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
    if (terminatedRef.current) {
      return;
    }

    if (isMock) {
      const mock = getMockHostGameState(mockState);
      setRoom({ ...mock.room, code: roomCode ?? mock.room.code });
      setActivePlayerId(mock.activePlayerId);
      setTurnExpiresAt(mock.turnExpiresAt);
      setTimelines(mock.timelines);
      setCurrentCard(mock.currentCard);
      setTentativePlacementIndex(mock.tentativePlacementIndex);
      setReveal(mock.reveal);
      setRevealDisplay(mock.reveal);
      setRevealContentVisible(Boolean(mock.reveal));
      setRevealExitActive(false);
      setStatus(mock.status);
      setError(mock.error);
      setPreviewState(mock.previewState);
      setPreviewUrl(mock.previewUrl);
      setIsPlaying(mock.isPlaying);
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
      clearRevealState();
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
      clearRevealState();
      setTimelines(timelineMap);
      setCurrentCard(payload.card);
      setActivePlayerId(payload.activePlayerId);
      setTentativePlacementIndex(null);
      setStatus('');
      void startPreview(payload.card);
    });

    socket.on('turn.placed', (payload: TurnPlaced) => {
      setTentativePlacementIndex(payload.placementIndex);
    });

    socket.on('turn.removed', () => {
      setTentativePlacementIndex(null);
    });

    socket.on('turn.reveal', (payload: TurnReveal) => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      if (revealContentTimerRef.current !== null) {
        window.clearTimeout(revealContentTimerRef.current);
        revealContentTimerRef.current = null;
      }
      if (revealExitTimerRef.current !== null) {
        window.clearTimeout(revealExitTimerRef.current);
        revealExitTimerRef.current = null;
      }
      setReveal(payload);
      setRevealDisplay(payload);
      setRevealContentVisible(false);
      setRevealExitActive(false);
      setTentativePlacementIndex(null);
      setCurrentCard(payload.card);
      pendingRevealRef.current = payload;
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

    socket.on(GAME_TERMINATED_EVENT, (payload: GameTerminationPayload) => {
      handleTermination(payload);
    });

    socket.on('room.closed', (payload: { reason: string }) => {
      if (terminatedRef.current) {
        return;
      }
      setError(`Room closed: ${payload?.reason ?? 'unknown'}`);
      stopPreview();
      if (roomCode) {
        clearRoomStorage(roomCode);
      } else {
        clearHostSession();
      }
      router.replace('/host');
    });

    socket.emit('host.resume', { hostSessionToken }, (response: AckResponse) => {
      if (response.ok) {
        return;
      }
      if (response.code === 'ROOM_TERMINATED') {
        handleTermination({ reason: 'HOST_ENDED', terminatedAt: Date.now() });
        return;
      }
      if (response.code === 'SESSION_NOT_FOUND' || response.code === 'ROOM_NOT_FOUND') {
        if (roomCode) {
          clearRoomStorage(roomCode);
        } else {
          clearHostSession();
        }
        setError('Host session expired. Create a new room.');
        router.replace('/host');
        return;
      }
      setError(response.message ?? 'Unable to resume host session.');
    });

    return () => {
      stopPreview(false);
      if (terminationTimeoutRef.current !== null) {
        window.clearTimeout(terminationTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, [
    clearRevealState,
    handleTermination,
    isMock,
    mockState,
    roomCode,
    router,
    startPreview,
    stopPreview,
  ]);

  useEffect(() => {
    if (isMock) {
      return;
    }
    if (!room) {
      return;
    }
    if (room.phase === 'LOBBY') {
      router.replace(`/host/${roomCode}/lobby`);
    }
  }, [isMock, room, roomCode, router]);

  useEffect(() => {
    if (!turnExpiresAt) {
      setRemainingMs(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, turnExpiresAt - Date.now());
      setRemainingMs(remaining);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 100);
    return () => window.clearInterval(interval);
  }, [turnExpiresAt]);

  useEffect(() => {
    if (isMock) {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      if (revealContentTimerRef.current !== null) {
        window.clearTimeout(revealContentTimerRef.current);
        revealContentTimerRef.current = null;
      }
      if (revealExitTimerRef.current !== null) {
        window.clearTimeout(revealExitTimerRef.current);
        revealExitTimerRef.current = null;
      }
      setRevealDisplay(reveal);
      setRevealContentVisible(Boolean(reveal));
      setRevealExitActive(false);
      return;
    }
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (revealContentTimerRef.current !== null) {
      window.clearTimeout(revealContentTimerRef.current);
      revealContentTimerRef.current = null;
    }
    if (revealExitTimerRef.current !== null) {
      window.clearTimeout(revealExitTimerRef.current);
      revealExitTimerRef.current = null;
    }
    if (!revealDisplay || revealDisplay.playerId !== activePlayerId) {
      setRevealContentVisible(false);
      setRevealExitActive(false);
      if (revealDisplay && revealDisplay.playerId !== activePlayerId) {
        setRevealDisplay(null);
      }
      return;
    }
    setRevealContentVisible(false);
    setRevealExitActive(false);
    revealContentTimerRef.current = window.setTimeout(() => {
      setRevealContentVisible(true);
      revealContentTimerRef.current = null;
    }, REVEAL_FLIP_DURATION_MS);
    if (!revealDisplay.correct) {
      revealExitTimerRef.current = window.setTimeout(() => {
        setRevealExitActive(true);
        revealExitTimerRef.current = null;
      }, REVEAL_EXIT_DELAY_MS);
    }
    revealTimerRef.current = window.setTimeout(() => {
      setRevealDisplay(null);
      setReveal(null);
      setRevealContentVisible(false);
      setRevealExitActive(false);
      const pendingReveal = pendingRevealRef.current;
      if (pendingReveal) {
        setTimelines((prev) => ({
          ...prev,
          [pendingReveal.playerId]: pendingReveal.timeline,
        }));
        pendingRevealRef.current = null;
      }
      revealTimerRef.current = null;
    }, REVEAL_DURATION_MS);
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      if (revealContentTimerRef.current !== null) {
        window.clearTimeout(revealContentTimerRef.current);
        revealContentTimerRef.current = null;
      }
      if (revealExitTimerRef.current !== null) {
        window.clearTimeout(revealExitTimerRef.current);
        revealExitTimerRef.current = null;
      }
    };
  }, [activePlayerId, isMock, reveal, revealDisplay]);

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
    const faceDown = !revealForActive;
    const highlight = revealContentVisible
      ? revealForActive?.correct
        ? 'good'
        : 'bad'
      : undefined;
    const isExiting = Boolean(revealForActive && !revealForActive.correct && revealExitActive);

    const baseTimeline = [...activeTimeline];
    const currentKey = current ? `${current.title}-${current.artist}-${current.year}` : 'current-card';
    const revealKey = revealForActive
      ? `${revealForActive.card.title}-${revealForActive.card.artist}-${revealForActive.card.year}`
      : null;
    if (
      revealForActive?.correct &&
      placementIndex !== null &&
      placementIndex < baseTimeline.length &&
      revealKey &&
      baseTimeline.some(
        (card) =>
          `${card.title}-${card.artist}-${card.year}` === revealKey
      )
    ) {
      baseTimeline.splice(placementIndex, 1);
    }

    baseTimeline.forEach((card, index) => {
      if (showCurrent && placementIndex === index && current) {
        items.push({
          key: currentKey,
          card: current,
          faceDown,
          isExiting,
          highlight,
          isCurrent: true,
        });
      }
      items.push({
        key: `${card.title}-${card.artist}-${card.year}`,
        card,
        faceDown: false,
        isExiting: false,
        isCurrent: false,
      });
    });

    if (showCurrent && placementIndex !== null && placementIndex >= baseTimeline.length && current) {
      items.push({
        key: currentKey,
        card: current,
        faceDown,
        isExiting,
        highlight,
        isCurrent: true,
      });
    }

    return items;
  }, [
    activePlayerId,
    currentCard,
    revealContentVisible,
    revealDisplay,
    revealExitActive,
    tentativePlacementIndex,
    timelines,
  ]);

  const playerCount = room?.players.length ?? 0;
  const turnNumber = room?.turnNumber ?? 0;
  const roundNumber =
    playerCount > 0 ? Math.floor((Math.max(turnNumber, 1) - 1) / playerCount) + 1 : 1;
  const remainingSeconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const progressPct =
    remainingMs === null
      ? 0
      : Math.max(0, Math.min(100, (remainingMs / (TURN_DURATION_SECONDS * 1000)) * 100));
  const isEndGameDisabled = endGameBusy || terminatedRef.current;

  return (
    <div className={`host-game ${isFullscreen ? 'is-fullscreen' : ''}`} ref={hostRef}>
      <HostHeader
        players={room?.players ?? []}
        activePlayerId={activePlayerId}
        isFullscreen={isFullscreen}
        isFullscreenSupported={isFullscreenSupported}
        fullscreenError={fullscreenError}
        onToggleFullscreen={toggleFullscreen}
        onRequestEndGame={requestEndGame}
        endGameDisabled={isEndGameDisabled}
      />

      <HostTurnBanner roundNumber={roundNumber} activePlayerName={activePlayer?.name ?? null} />

      <TimelineStripAnimated items={timelineItems} revealDisplay={revealDisplay} />

      <section className="host-timer">
        <TurnTimer remainingSeconds={remainingSeconds} progressPct={progressPct} />
        <AudioPreviewControls
          phase={room?.phase}
          previewState={previewState}
          previewUrl={previewUrl}
          isPlaying={isPlaying}
          onAttemptPlay={attemptPlay}
          onTogglePlay={togglePlay}
        />
      </section>

      <HostStatusBanners status={status} error={error} />

      {showEndGameConfirm ? (
        <div className="host-modal" role="dialog" aria-modal="true" onClick={cancelEndGame}>
          <div className="host-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="host-modal-title">End game for everyone?</div>
            <div className="host-modal-body">This will end the session for all players.</div>
            <div className="host-modal-actions">
              <button
                type="button"
                className="button secondary small"
                onClick={cancelEndGame}
                disabled={endGameBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger small"
                onClick={confirmEndGame}
                disabled={endGameBusy}
              >
                {endGameBusy ? 'Ending...' : 'End game'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
