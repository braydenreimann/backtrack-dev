'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import { isPhoneDevice } from '@/lib/device';
import type { RoomSnapshot } from '@/lib/contracts/game';
import {
  ACK_ERROR_CODES,
  CLIENT_TO_SERVER_EVENTS,
  SERVER_TO_CLIENT_EVENTS,
  type AckResponse,
  type GameTerminationPayload,
  type PlayerResumeAck,
  type RoomClosedPayload,
} from '@/lib/contracts/socket';
import {
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

export default function PlayLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMock, mockState, mockQuery } = getMockConfig(searchParams);
  const roomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const kickTimeoutRef = useRef<number | null>(null);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState('Connecting to lobby...');
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [playerName, setPlayerName] = useState('Player');
  const [kicked, setKicked] = useState(false);

  const redirectToPlay = useCallback(
    () => router.replace(isMock ? `/play${mockQuery}` : '/play'),
    [isMock, mockQuery, router]
  );

  const { handleTermination, terminatedRef, clearRedirectTimeout } = useRoomTermination({
    role: 'player',
    roomCode,
    isMock,
    onTerminateNow: () => {
      if (kickTimeoutRef.current !== null) {
        window.clearTimeout(kickTimeoutRef.current);
        kickTimeoutRef.current = null;
      }
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
    const storedName = getPlayerName();
    if (storedName) {
      setPlayerName(storedName);
    }
  }, []);

  useEffect(() => {
    if (!roomCode || isPhone === null) {
      return;
    }
    if (terminatedRef.current) {
      return;
    }

    if (isMock) {
      const mock = getMockPlayRoomState(mockState);
      setRoom({ ...mock.room, code: roomCode ?? mock.room.code });
      setStatus(mock.status);
      setError(mock.error);
      if (mock.room.phase !== 'LOBBY') {
        router.replace(`/play/${roomCode}/game${mockQuery}`);
      }
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
      setRoom(snapshot);
      if (snapshot.phase === 'LOBBY') {
        setStatus('Lobby connected.');
      }
      if (snapshot.phase !== 'LOBBY') {
        router.replace(`/play/${roomCode}/game`);
      }
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.GAME_STARTED, () => {
      router.replace(`/play/${roomCode}/game`);
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.GAME_TERMINATED, (payload: GameTerminationPayload) => {
      handleTermination(payload);
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.PLAYER_KICKED, () => {
      setKicked(true);
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
        setKicked(true);
        clearRoomSessionForRole('player', roomCode);
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

  useEffect(() => {
    if (isMock) {
      return;
    }
    if (!room || room.phase === 'LOBBY') {
      return;
    }
    router.replace(`/play/${roomCode}/game`);
  }, [isMock, room, roomCode, router]);

  const leaveLobby = () => {
    if (isMock) {
      clearSessionForRole('player');
      redirectToPlay();
      return;
    }
    const socket = socketRef.current;
    if (!socket) {
      clearSessionForRole('player');
      redirectToPlay();
      return;
    }
    setLeaving(true);
    socket.emit(CLIENT_TO_SERVER_EVENTS.ROOM_LEAVE, {}, (response: AckResponse) => {
      if (response.ok) {
        clearSessionForRole('player');
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
        <div className="status">Waiting for host to start...</div>
        <button className="button secondary" onClick={leaveLobby} disabled={leaving || kicked}>
          {leaving ? 'Leaving...' : 'Leave lobby'}
        </button>
      </div>
      {status ? <div className="status">{status}</div> : null}
      {error ? <div className="status bad">{error}</div> : null}

      <section className="card">
        <h2 className="title" style={{ fontSize: '1.35rem' }}>
          Players
        </h2>
        <div className="list">
          {(room?.players ?? []).length === 0 ? (
            <div className="status">No players yet. Waiting for others to join.</div>
          ) : (
            room?.players.map((player) => (
              <div className="list-item scoreboard-item" key={player.id}>
                <div>
                  <div className="score-name">{player.name}</div>
                  <div className="pill">{player.connected ? 'Connected' : 'Disconnected'}</div>
                </div>
                <div className="score-count">{player.cardCount}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
