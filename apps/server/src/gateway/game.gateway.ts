import { OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { RoomJoinPayload, SignalPayload } from '../../packages/shared/src/types';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server!: Server;

  onModuleInit() {
    this.server?.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      console.log(`Total clients: ${this.server.engine.clientsCount}`);
    });
  }

  private rooms = new Map<string, string[]>();

  @SubscribeMessage('ping')
  handlePing() {

    console.log('Received ping');
    this.server.emit('pong', {
        message: 'pong',
    });

    return { event: 'pong' };
  }

  @SubscribeMessage('room:create')
  handleCreate(@ConnectedSocket() client: Socket) {
    const code = this.generateCode();
    this.rooms.set(code, [client.id]);
    client.join(code);

    return {
      event: 'room:created',
      data: {
        roomCode: code,
      },
    };
  }

  @SubscribeMessage('room:join')
  handleJoin(
    @MessageBody() payloads: RoomJoinPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const payload = JSON.parse(JSON.stringify(payloads)) as RoomJoinPayload;
    console.log('Received join request:', payload);
    console.log(`Client ${client.id} joining room ${payload.roomCode}`);
    const room = this.rooms.get(payload.roomCode);
    if (!room || room.length >= 2)
      return { event: 'room:error', data: 'Room full or not found' };

    room.push(client.id);
    client.join(payload.roomCode);

    this.server.to(payload.roomCode).emit('room:ready', {
      roomCode: payload.roomCode,
      initiator: room[0],
      joiner: room[1],
    });
  }

  @SubscribeMessage('peer:id')
  handlePeerId(
    @MessageBody() payload: { roomCode: string; peerId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.to(payload.roomCode).emit('peer:id', { peerId: payload.peerId });
  }

  @SubscribeMessage('signal')
  handleSignal(
    @MessageBody() payload: SignalPayload,
    @ConnectedSocket() client: Socket,
  ) {
    client.to(payload.roomCode).emit('signal', payload.signal);
  }

  handleDisconnect(client: Socket) {
    this.rooms.forEach((players, code) => {
      if (players.includes(client.id)) {
        this.server.to(code).emit('room:playerLeft', { 
            roomCode: code,
            message: 'Opponent disconnected',
        });
        this.rooms.delete(code);
      }
    });
  }

  private generateCode(): string {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
  }
}
