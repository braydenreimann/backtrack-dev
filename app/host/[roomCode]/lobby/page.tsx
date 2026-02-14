'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import type { RoomSnapshot } from '@/lib/contracts/game';
import {
  ACK_ERROR_CODES,
  CLIENT_TO_SERVER_EVENTS,
  SERVER_TO_CLIENT_EVENTS,
  type AckResponse,
  type GameTerminationPayload,
  type HostResumeAck,
  type KickPlayerAck,
  type RoomClosedPayload,
} from '@/lib/contracts/socket';
import {
  clearRoomSessionForRole,
  clearSessionForRole,
  getSessionRoomCodeForRole,
  getSessionTokenForRole,
} from '@/lib/realtime/session-role';
import { useRoomTermination } from '@/lib/realtime/useRoomTermination';
import { getMockHostLobbyState } from '@/lib/fixtures';
import { getMockConfig } from '@/lib/mock';

export default function HostLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMock, mockState, mockQuery } = getMockConfig(searchParams);
  const roomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<string>('Connecting to lobby...');
  const [error, setError] = useState<string | null>(null);
  const [kickBusy, setKickBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);

  const { handleTermination, terminatedRef } = useRoomTermination({
    role: 'host',
    roomCode,
    isMock,
    onTerminateNow: () => {
      socketRef.current?.disconnect();
    },
    onRedirect: () => {
      router.replace('/host');
    },
    onStatus: setStatus,
    onClearError: () => setError(null),
  });

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

    const hostSessionToken = getSessionTokenForRole('host');
    if (!hostSessionToken) {
      setError('Missing host session. Return to /host to create a room.');
      return;
    }

    const storedRoom = getSessionRoomCodeForRole('host');
    if (storedRoom && storedRoom !== roomCode) {
      setStatus('Session room mismatch. Attempting to resume anyway.');
    }

    const socket = createSocket();
    socketRef.current = socket;

    socket.on(SERVER_TO_CLIENT_EVENTS.ROOM_SNAPSHOT, (snapshot: RoomSnapshot) => {
      setRoom(snapshot);
      if (snapshot.phase === 'LOBBY') {
        setStatus('Lobby connected.');
      }
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.GAME_STARTED, () => {
      router.replace(`/host/${roomCode}/game`);
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.GAME_TERMINATED, (payload: GameTerminationPayload) => {
      handleTermination(payload);
    });

    socket.on(SERVER_TO_CLIENT_EVENTS.ROOM_CLOSED, (payload: RoomClosedPayload) => {
      if (terminatedRef.current) {
        return;
      }
      setError(`Room closed: ${payload?.reason ?? 'unknown'}`);
      clearRoomSessionForRole('host', roomCode);
      router.replace('/host');
    });

    socket.emit(
      CLIENT_TO_SERVER_EVENTS.HOST_RESUME,
      { hostSessionToken },
      (response: AckResponse<HostResumeAck>) => {
      if (response.ok) {
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
        clearRoomSessionForRole('host', roomCode);
        setError('Host session expired. Create a new room.');
        router.replace('/host');
        return;
      }
      setError(response.message ?? 'Unable to resume host session.');
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [handleTermination, isMock, mockState, roomCode, router, terminatedRef]);

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
    socket.emit(
      CLIENT_TO_SERVER_EVENTS.PLAYER_KICK,
      { playerId },
      (response: AckResponse<KickPlayerAck>) => {
      if (!response.ok) {
        setError(response.message ?? 'Unable to kick player.');
      }
      setKickBusy(null);
      }
    );
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
    socket.emit(CLIENT_TO_SERVER_EVENTS.ROOM_DELETE, {}, (response: AckResponse) => {
      if (response.ok) {
        clearSessionForRole('host');
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
    socket.emit(CLIENT_TO_SERVER_EVENTS.GAME_START, {}, (response: AckResponse) => {
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
