'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import { isPhoneDevice } from '@/lib/device';
import {
  clearPlayerSession,
  getPlayerName,
  getPlayerRoomCode,
  getPlayerSessionToken,
} from '@/lib/storage';
import { getMockPlayRoomState } from '@/lib/fixtures';
import { getMockConfig } from '@/lib/mock';
import type { RoomSnapshot } from '@/lib/game-types';

type AckOk = { ok: true } & Record<string, unknown>;

type AckErr = { ok: false; code: string; message: string };

type AckResponse = AckOk | AckErr;

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
      if (snapshot.phase === 'LOBBY') {
        setStatus('Lobby connected.');
      }
      if (snapshot.phase !== 'LOBBY') {
        router.replace(`/play/${roomCode}/game`);
      }
    });

    socket.on('game.started', () => {
      router.replace(`/play/${roomCode}/game`);
    });

    socket.on('player.kicked', () => {
      setKicked(true);
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
        setKicked(true);
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
