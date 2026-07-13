import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';

type SettingsFile = { globalPrompt?: string };

@Injectable()
export class SettingsService {
  private readonly file = path.join(config.storageDir, 'settings.json');
  private prompt = (process.env.GLOBAL_PROMPT ?? '').trim();
  private loaded = false;

  async getGlobalPrompt(): Promise<string> {
    await this.load();
    return this.prompt;
  }

  async setGlobalPrompt(prompt: string): Promise<string> {
    const normalized = prompt.trim();
    if (normalized.length > 4000) throw new BadRequestException('Global prompt must be 4000 characters or fewer');
    this.prompt = normalized;
    this.loaded = true;
    await writeFile(this.file, JSON.stringify({ globalPrompt: this.prompt }, null, 2));
    return this.prompt;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as SettingsFile;
      if (typeof data.globalPrompt === 'string') this.prompt = data.globalPrompt;
    } catch {
      // A missing settings file means the environment default is active.
    }
  }
}
