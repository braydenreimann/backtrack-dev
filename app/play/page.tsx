'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import { isPhoneDevice } from '@/lib/device';
import { getPlayerRoomCode, getPlayerSessionToken, setPlayerSession } from '@/lib/storage';

type AckOk = { ok: true } & Record<string, unknown>;

type AckErr = { ok: false; code: string; message: string };

type AckResponse = AckOk | AckErr;

export default function PlayLandingPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);

  useEffect(() => {
    setIsPhone(isPhoneDevice(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!isPhone) {
      return;
    }
    const token = getPlayerSessionToken();
    const storedRoom = getPlayerRoomCode();
    if (token && storedRoom) {
      router.replace(`/play/${storedRoom}`);
    }
  }, [isPhone, router]);

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    if (!isPhone) {
      setError('Please join from a phone.');
      return;
    }

    setLoading(true);
    setError(null);
    const socket = createSocket();
    const trimmedRoom = roomCode.trim().toUpperCase();
    const trimmedName = name.trim();

    socket.emit('room.join', { roomCode: trimmedRoom, name: trimmedName }, (response: AckResponse) => {
      if (response.ok) {
        const playerId = response.playerId as string;
        const playerSessionToken = response.playerSessionToken as string;
        setPlayerSession(playerSessionToken, playerId, trimmedRoom, trimmedName);
        socket.disconnect();
        router.push(`/play/${trimmedRoom}`);
      } else {
        setError(response.message ?? 'Unable to join room.');
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
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                required
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
