'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { getMockHostLobbyState } from '@/lib/fixtures';
import { getMockConfig } from '@/lib/mock';
import { GAME_TERMINATED_EVENT, type GameTerminationPayload, type RoomSnapshot } from '@/lib/game-types';

type AckOk = { ok: true } & Record<string, unknown>;

type AckErr = { ok: false; code: string; message: string };

type AckResponse = AckOk | AckErr;

const TERMINATION_REDIRECT_DELAY_MS = 1500;

export default function HostLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMock, mockState, mockQuery } = getMockConfig(searchParams);
  const roomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const terminationTimeoutRef = useRef<number | null>(null);
  const terminatedRef = useRef(false);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<string>('Connecting to lobby...');
  const [error, setError] = useState<string | null>(null);
  const [kickBusy, setKickBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);

  const handleTermination = useCallback(
    (payload: { reason: string; terminatedAt: number }, options?: { persistMarker?: boolean }) => {
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
      setError(null);
      setStatus('Game ended by host.');
      socketRef.current?.disconnect();
      terminationTimeoutRef.current = window.setTimeout(() => {
        router.replace('/host');
      }, TERMINATION_REDIRECT_DELAY_MS);
    },
    [roomCode, router]
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

  useEffect(() => {
    if (!roomCode) {
      return;
    }
    if (terminatedRef.current) {
      return;
    }

    if (isMock) {
      const mock = getMockHostLobbyState(mockState);
      setRoom({ ...mock.room, code: roomCode ?? mock.room.code });
      setStatus(mock.status);
      setError(mock.error);
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
      setRoom(snapshot);
      if (snapshot.phase === 'LOBBY') {
        setStatus('Lobby connected.');
      }
    });

    socket.on('game.started', () => {
      router.replace(`/host/${roomCode}/game`);
    });

    socket.on(GAME_TERMINATED_EVENT, (payload: GameTerminationPayload) => {
      handleTermination(payload);
    });

    socket.on('room.closed', (payload: { reason: string }) => {
      if (terminatedRef.current) {
        return;
      }
      setError(`Room closed: ${payload?.reason ?? 'unknown'}`);
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
      if (terminationTimeoutRef.current !== null) {
        window.clearTimeout(terminationTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, [handleTermination, isMock, mockState, roomCode, router]);

  useEffect(() => {
    if (isMock) {
      return;
    }
    if (!room || room.phase === 'LOBBY') {
      return;
    }
    router.replace(`/host/${roomCode}/game`);
  }, [isMock, room, roomCode, router]);

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
    if (isMock) {
      router.push(`/host${mockQuery}`);
      return;
    }
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
    if (isMock) {
      router.push(`/host/${roomCode}/game${mockQuery}`);
      return;
    }
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

  return (
    <div className="container host-layout">
      <section className="card host-header">
        <div>
          <h1 className="title">Room {roomCode}</h1>
          <p className="subtitle">Lobby</p>
        </div>
      </section>

      {status ? <div className="status">{status}</div> : null}
      {error ? <div className="status bad">{error}</div> : null}

      <section className="card scoreboard">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="title" style={{ fontSize: '1.4rem' }}>
            Players
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
              <div className="list-item scoreboard-item" key={player.id}>
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
    </div>
  );
}
