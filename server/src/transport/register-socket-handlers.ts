import type { Server, Socket } from 'socket.io';
import {
  CLIENT_TO_SERVER_EVENTS,
  type GamePauseRequest,
  type GameResumeRequest,
  type GameStartRequest,
  type GameTerminateRequest,
  type HostResumeAck,
  type HostResumeRequest,
  type KickPlayerAck,
  type KickPlayerRequest,
  type PlayerResumeAck,
  type PlayerResumeRequest,
  type RoomCreateAck,
  type RoomCreateRequest,
  type RoomDeleteRequest,
  type RoomJoinAck,
  type RoomJoinRequest,
  type RoomLeaveRequest,
  type TurnLockRequest,
  type TurnPlaceRequest,
  type TurnRemoveRequest,
  type TurnRevealRequest,
} from '../../../lib/contracts/socket.js';
import type { Ack, GameEngine } from '../domain/game-engine.js';

export const registerSocketHandlers = (io: Server, engine: GameEngine) => {
  io.on('connection', (socket: Socket) => {
    socket.on(CLIENT_TO_SERVER_EVENTS.ROOM_CREATE, (payload: RoomCreateRequest, ack?: Ack<RoomCreateAck>) => {
      engine.commandRoomCreate(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.ROOM_JOIN, (payload: RoomJoinRequest, ack?: Ack<RoomJoinAck>) => {
      engine.commandRoomJoin(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.HOST_RESUME, (payload: HostResumeRequest, ack?: Ack<HostResumeAck>) => {
      engine.commandHostResume(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.PLAYER_RESUME, (payload: PlayerResumeRequest, ack?: Ack<PlayerResumeAck>) => {
      engine.commandPlayerResume(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.GAME_START, (payload: GameStartRequest, ack?: Ack) => {
      engine.commandGameStart(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.GAME_PAUSE, (payload: GamePauseRequest, ack?: Ack) => {
      engine.commandGamePause(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.GAME_RESUME, (payload: GameResumeRequest, ack?: Ack) => {
      engine.commandGameResume(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.GAME_TERMINATE, (payload: GameTerminateRequest, ack?: Ack) => {
      engine.commandGameTerminate(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.TURN_PLACE, (payload: TurnPlaceRequest, ack?: Ack) => {
      engine.commandTurnPlace(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.TURN_REMOVE, (payload: TurnRemoveRequest, ack?: Ack) => {
      engine.commandTurnRemove(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.TURN_LOCK, (payload: TurnLockRequest, ack?: Ack) => {
      engine.commandTurnLock(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.TURN_REVEAL, (payload: TurnRevealRequest, ack?: Ack) => {
      engine.commandTurnReveal(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.PLAYER_KICK, (payload: KickPlayerRequest, ack?: Ack<KickPlayerAck>) => {
      engine.commandKickPlayer(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.ROOM_LEAVE, (payload: RoomLeaveRequest, ack?: Ack) => {
      engine.commandRoomLeave(socket, payload, ack);
    });

    socket.on(CLIENT_TO_SERVER_EVENTS.ROOM_DELETE, (payload: RoomDeleteRequest, ack?: Ack) => {
      engine.commandRoomDelete(socket, payload, ack);
    });

    socket.on('disconnect', () => {
      engine.commandDisconnect(socket);
    });
  });
};
