import { io, Socket } from 'socket.io-client';
import { resolveSocketUrl } from '@/lib/env/web-env';

export const getSocketUrl = (): string => resolveSocketUrl();

export const createSocket = (): Socket => {
  return io(getSocketUrl(), {
    transports: ['polling', 'websocket'],
    timeout: 5000,
  });
};
