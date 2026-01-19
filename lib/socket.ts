import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

export const createSocket = (): Socket => {
  return io(SOCKET_URL, {
    transports: ['polling', 'websocket'],
    timeout: 5000,
  });
};
