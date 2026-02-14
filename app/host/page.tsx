'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import { getHostRoomCode, getHostSessionToken, setHostSession } from '@/lib/storage';
import {
  CLIENT_TO_SERVER_EVENTS,
  type AckResponse,
  type RoomCreateAck,
} from '@/lib/contracts/socket';
import { getMockConfig } from '@/lib/mock';

function HostLandingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMock, mockQuery } = getMockConfig(searchParams);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canResume, setCanResume] = useState(false);

  useEffect(() => {
    setCanResume(Boolean(getHostSessionToken() && getHostRoomCode()));
  }, []);

  const createRoom = () => {
    if (isMock) {
      router.push(`/host/ABC123/lobby${mockQuery}`);
      return;
    }
    setLoading(true);
    setError(null);
    const socket = createSocket();
    socket.emit(CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, {}, (response: AckResponse<RoomCreateAck>) => {
      if (response.ok) {
        const roomCode = response.roomCode;
        const hostSessionToken = response.hostSessionToken;
        setHostSession(hostSessionToken, roomCode);
        socket.disconnect();
        router.push(`/host/${roomCode}/lobby`);
      } else {
        setError(response.message ?? 'Unable to create room.');
        socket.disconnect();
        setLoading(false);
      }
    });
  };

  const resumeRoom = () => {
    if (isMock) {
      router.push(`/host/ABC123/lobby${mockQuery}`);
      return;
    }
    const roomCode = getHostRoomCode();
    if (!roomCode) {
      return;
    }
    router.push(`/host/${roomCode}/lobby`);
  };

  return (
    <div className="container">
      <section className="card">
        <h1 className="title">Host a Backtrack room</h1>
        <p className="subtitle">Create a lobby and let players join from their phones.</p>
      </section>
      <section className="card row">
        <button className="button" onClick={createRoom} disabled={loading}>
          {loading ? 'Creating room...' : 'Create room'}
        </button>
        {canResume ? (
          <button className="button secondary" onClick={resumeRoom} disabled={loading}>
            Resume previous room
          </button>
        ) : null}
      </section>
      {error ? <div className="status bad">{error}</div> : null}
    </div>
  );
}

export default function HostLandingPage() {
  return (
    <Suspense fallback={<div className="container"><div className="status">Loading...</div></div>}>
      <HostLandingPageContent />
    </Suspense>
  );
}
