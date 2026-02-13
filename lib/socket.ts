import { io, Socket } from 'socket.io-client';

export const getSocketUrl = (): string => {
  const configuredUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:3001`;
};

export const createSocket = (): Socket => {
  return io(getSocketUrl(), {
    transports: ['polling', 'websocket'],
    timeout: 5000,
  });
};
