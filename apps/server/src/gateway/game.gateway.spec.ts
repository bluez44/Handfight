import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';

const createMockSocket = (id: string) => ({
  id,
  join: jest.fn(),
  to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  emit: jest.fn(),
});

const createMockServer = () => ({
  on: jest.fn(),
  emit: jest.fn(),
  to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  engine: { clientsCount: 0 },
});

describe('GameGateway', () => {
  let gateway: GameGateway;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameGateway],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
    mockServer = createMockServer();
    gateway.server = mockServer as any;
  });

  // ── onModuleInit ──────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should register a connection handler on the server', () => {
      gateway.onModuleInit();
      expect(mockServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  // ── handlePing ────────────────────────────────────────────────────────────

  describe('handlePing', () => {
    it('should broadcast pong to all clients', () => {
      gateway.handlePing();
      expect(mockServer.emit).toHaveBeenCalledWith('pong', { message: 'pong' });
    });

    it('should return the pong event', () => {
      const result = gateway.handlePing();
      expect(result).toEqual({ event: 'pong' });
    });
  });

  // ── handleCreate ──────────────────────────────────────────────────────────

  describe('handleCreate', () => {
    it('should return room:created with a 5-character uppercase room code', () => {
      const client = createMockSocket('socket-1');
      const result = gateway.handleCreate(client as any);

      expect(result).toEqual({
        event: 'room:created',
        data: { roomCode: expect.stringMatching(/^[A-Z0-9]{5}$/) },
      });
    });

    it('should join the socket to the created room', () => {
      const client = createMockSocket('socket-1');
      const { data: { roomCode } } = gateway.handleCreate(client as any);

      expect(client.join).toHaveBeenCalledWith(roomCode);
    });

    it('should generate a unique code on each call', () => {
      const client = createMockSocket('socket-1');
      const { data: { roomCode: code1 } } = gateway.handleCreate(client as any);
      const { data: { roomCode: code2 } } = gateway.handleCreate(client as any);

      expect(code1).not.toBe(code2);
    });
  });

  // ── handleJoin ────────────────────────────────────────────────────────────

  describe('handleJoin', () => {
    it('should return room:error when the room does not exist', () => {
      const client = createMockSocket('socket-2');
      const result = gateway.handleJoin({ roomCode: 'XXXXX' }, client as any);

      expect(result).toEqual({ event: 'room:error', data: 'Room full or not found' });
    });

    it('should join the socket to the room', () => {
      const host = createMockSocket('socket-1');
      const joiner = createMockSocket('socket-2');
      const { data: { roomCode } } = gateway.handleCreate(host as any);

      mockServer.to.mockReturnValue({ emit: jest.fn() });
      gateway.handleJoin({ roomCode }, joiner as any);

      expect(joiner.join).toHaveBeenCalledWith(roomCode);
    });

    it('should emit room:ready to both players with correct initiator and joiner', () => {
      const host = createMockSocket('socket-1');
      const joiner = createMockSocket('socket-2');
      const { data: { roomCode } } = gateway.handleCreate(host as any);

      const mockRoomEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: mockRoomEmit });

      gateway.handleJoin({ roomCode }, joiner as any);

      expect(mockServer.to).toHaveBeenCalledWith(roomCode);
      expect(mockRoomEmit).toHaveBeenCalledWith('room:ready', {
        roomCode,
        initiator: 'socket-1',
        joiner: 'socket-2',
      });
    });

    it('should return room:error when the room is already full', () => {
      const host = createMockSocket('socket-1');
      const joiner1 = createMockSocket('socket-2');
      const joiner2 = createMockSocket('socket-3');
      const { data: { roomCode } } = gateway.handleCreate(host as any);

      mockServer.to.mockReturnValue({ emit: jest.fn() });
      gateway.handleJoin({ roomCode }, joiner1 as any);

      const result = gateway.handleJoin({ roomCode }, joiner2 as any);
      expect(result).toEqual({ event: 'room:error', data: 'Room full or not found' });
    });
  });

  // ── handleSignal ──────────────────────────────────────────────────────────

  describe('handleSignal', () => {
    it('should relay the signal to other clients in the room', () => {
      const client = createMockSocket('socket-1');
      const mockRelayEmit = jest.fn();
      client.to = jest.fn().mockReturnValue({ emit: mockRelayEmit });

      const signal = { type: 'offer', sdp: 'test-sdp' };
      gateway.handleSignal({ roomCode: 'ROOM1', signal }, client as any);

      expect(client.to).toHaveBeenCalledWith('ROOM1');
      expect(mockRelayEmit).toHaveBeenCalledWith('signal', signal);
    });

    it('should not emit back to the sender', () => {
      const client = createMockSocket('socket-1');
      const signal = { type: 'answer', sdp: 'test-sdp' };

      gateway.handleSignal({ roomCode: 'ROOM1', signal }, client as any);

      // client.emit is direct emit to self — must not be called
      expect(client.emit).not.toHaveBeenCalled();
    });
  });

  // ── handleDisconnect ──────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('should emit room:playerLeft with room info when a client disconnects', () => {
      const host = createMockSocket('socket-1');
      const { data: { roomCode } } = gateway.handleCreate(host as any);

      const mockRoomEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: mockRoomEmit });

      gateway.handleDisconnect(host as any);

      expect(mockServer.to).toHaveBeenCalledWith(roomCode);
      expect(mockRoomEmit).toHaveBeenCalledWith('room:playerLeft', {
        roomCode,
        message: 'Opponent disconnected',
      });
    });

    it('should delete the room after disconnect', () => {
      const host = createMockSocket('socket-1');
      const { data: { roomCode } } = gateway.handleCreate(host as any);

      mockServer.to.mockReturnValue({ emit: jest.fn() });
      gateway.handleDisconnect(host as any);

      // Room is gone — a new join attempt should return error
      const newClient = createMockSocket('socket-2');
      const result = gateway.handleJoin({ roomCode }, newClient as any);
      expect(result).toEqual({ event: 'room:error', data: 'Room full or not found' });
    });

    it('should not emit anything when the client is not in any room', () => {
      const unknownClient = createMockSocket('socket-unknown');
      gateway.handleDisconnect(unknownClient as any);

      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });
});
