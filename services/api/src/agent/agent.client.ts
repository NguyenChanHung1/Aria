import { BadGatewayException, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { config } from '../config';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AgentClient {
  constructor(private readonly settings: SettingsService) {}

  async createSong(brief: Record<string, unknown>, inputAsset?: Record<string, unknown>) {
    return this.request('/songs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...brief,
        global_prompt: await this.settings.getGlobalPrompt(),
        input_asset: inputAsset ?? null,
      }),
    });
  }

  async get(path: string): Promise<Response> {
    const response = await fetch(`${config.agentUrl}${path}`);
    if (!response.ok) throw new BadGatewayException(`AI service returned ${response.status}`);
    return response;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    try {
      const response = await fetch(`${config.agentUrl}${path}`, init);
      const body = await response.text();
      if (!response.ok) throw new BadGatewayException(body || `AI service returned ${response.status}`);
      return body ? JSON.parse(body) : {};
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('AI service is unavailable');
    }
  }

  async stream(response: Response): Promise<Readable> {
    if (!response.body) throw new BadGatewayException('AI service returned an empty event stream');
    return Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  }
}
