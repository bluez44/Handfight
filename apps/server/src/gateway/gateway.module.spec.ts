import { Test, TestingModule } from '@nestjs/testing';
import { GatewayModule } from './gateway.module';
import { GameGateway } from './game.gateway';

describe('GatewayModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide GameGateway', () => {
    const gateway = module.get<GameGateway>(GameGateway);
    expect(gateway).toBeDefined();
    expect(gateway).toBeInstanceOf(GameGateway);
  });
});
