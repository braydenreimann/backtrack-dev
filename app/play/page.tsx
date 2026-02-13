'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSocket, getSocketUrl } from '@/lib/socket';
import { isPhoneDevice } from '@/lib/device';
import { getPlayerRoomCode, getPlayerSessionToken, setPlayerSession } from '@/lib/storage';
import { getMockConfig } from '@/lib/mock';

type AckOk = { ok: true } & Record<string, unknown>;

type AckErr = { ok: false; code: string; message: string };

type AckResponse = AckOk | AckErr;

const normalizeRoomCode = (value: string) => value.replace(/\D/g, '').slice(0, 6);

function PlayLandingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMock, mockQuery } = getMockConfig(searchParams);
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);

  useEffect(() => {
    if (isMock) {
      setIsPhone(true);
      return;
    }
    setIsPhone(isPhoneDevice(navigator.userAgent));
  }, [isMock]);

  useEffect(() => {
    if (!isPhone || isMock) {
      return;
    }
    const token = getPlayerSessionToken();
    const storedRoom = getPlayerRoomCode();
    if (token && storedRoom) {
      router.replace(`/play/${storedRoom}`);
    }
  }, [isMock, isPhone, router]);

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    if (!isPhone && !isMock) {
      setError('Please join from a phone.');
      return;
    }

    if (isMock) {
      const trimmedRoom = normalizeRoomCode(roomCode) || '123456';
      const trimmedName = name.trim() || 'Player';
      setPlayerSession('mock-session', 'mock-player', trimmedRoom, trimmedName);
      router.push(`/play/${trimmedRoom}${mockQuery}`);
      return;
    }

    setLoading(true);
    setError(null);
    const socket = createSocket();
    const socketUrl = getSocketUrl();
    let settled = false;
    const joinTimeout = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      setError(`Unable to reach the game server at ${socketUrl}. Check Wi-Fi and server IP.`);
      socket.disconnect();
      setLoading(false);
    }, 7000);

    const handleConnectError = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(joinTimeout);
      setError(`Unable to reach the game server at ${socketUrl}. Check Wi-Fi and server IP.`);
      socket.disconnect();
      setLoading(false);
    };

    socket.on('connect_error', handleConnectError);
    const trimmedRoom = normalizeRoomCode(roomCode);
    const trimmedName = name.trim();

    socket.emit('room.join', { roomCode: trimmedRoom, name: trimmedName }, (response: AckResponse) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(joinTimeout);
      socket.off('connect_error', handleConnectError);
      if (response.ok) {
        const playerId = response.playerId as string;
        const playerSessionToken = response.playerSessionToken as string;
        setPlayerSession(playerSessionToken, playerId, trimmedRoom, trimmedName);
        socket.disconnect();
        router.push(`/play/${trimmedRoom}`);
      } else {
        if (response.code === 'ROOM_TERMINATED') {
          setError('This room has already ended. Ask the host for a new code.');
        } else {
          setError(response.message ?? 'Unable to join room.');
        }
        socket.disconnect();
        setLoading(false);
        if (response.code === 'NON_MOBILE_DEVICE') {
          setIsPhone(false);
        }
      }
    });
  };

  return (
    <div className="container">
      <section className="card">
        <h1 className="title">Join a Backtrack room</h1>
        <p className="subtitle">Players must join from a phone.</p>
      </section>
      <section className="card">
        {isPhone === false ? (
          <div className="status bad">Please join from a phone.</div>
        ) : (
          <form onSubmit={submitJoin} className="row" style={{ flexDirection: 'column' }}>
            <label>
              <div className="subtitle">Room code</div>
              <input
                className="input"
                value={roomCode}
                onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
                placeholder="123456"
                maxLength={6}
                required
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </label>
            <label>
              <div className="subtitle">Your name</div>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Add a short name"
                maxLength={16}
                required
              />
            </label>
            <button className="button" type="submit" disabled={loading}>
              {loading ? 'Joining...' : 'Join room'}
            </button>
          </form>
        )}
      </section>
      {error ? <div className="status bad">{error}</div> : null}
    </div>
  );
}

export default function PlayLandingPage() {
  return (
    <Suspense fallback={<div className="container"><div className="status">Loading...</div></div>}>
      <PlayLandingPageContent />
    </Suspense>
  );
}
