import { createServer } from 'http';
import { Server } from 'socket.io';
import { readServerEnv } from './config/env.js';
import { createGameEngine } from './domain/game-engine.js';
import { registerSocketHandlers } from './transport/register-socket-handlers.js';

const env = readServerEnv();
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, env.isCorsOriginAllowed(origin));
    },
  },
});

const gameEngine = createGameEngine(io);
registerSocketHandlers(io, gameEngine);

const defaultPort = env.port;

export const startServer = (port: number = defaultPort): Promise<number> =>
  new Promise((resolve, reject) => {
    if (httpServer.listening) {
      const address = httpServer.address();
      const activePort = typeof address === 'object' && address ? address.port : port;
      resolve(activePort);
      return;
    }

    const onError = (error: Error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      httpServer.off('error', onError);
      const address = httpServer.address();
      const activePort = typeof address === 'object' && address ? address.port : port;
      resolve(activePort);
    };

    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port);
  });

export const stopServer = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!httpServer.listening) {
      resolve();
      return;
    }

    io.close();
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

if (process.env.NODE_ENV !== 'test') {
  startServer()
    .then((port) => {
      const corsSummary =
        env.corsOrigins.length > 0 ? env.corsOrigins.join(', ') : 'local-dev defaults only';
      console.log(`Socket.IO server listening on http://localhost:${port}`);
      console.log(`CORS allowlist: ${corsSummary}`);
    })
    .catch((error) => {
      console.error('Failed to start Socket.IO server.', error);
      process.exitCode = 1;
    });
}
