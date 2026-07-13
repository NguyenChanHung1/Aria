import { Controller, Get } from '@nestjs/common';
import { AgentClient } from '../agent/agent.client';

@Controller('health')
export class HealthController {
  constructor(private readonly agent: AgentClient) {}

  @Get()
  async health() {
    try {
      const response = await this.agent.get('/health');
      return { status: 'ok', api: 'nestjs', agent: await response.json() };
    } catch {
      return { status: 'degraded', api: 'nestjs', agent: 'unavailable' };
    }
  }
}
