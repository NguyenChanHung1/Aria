import { BadRequestException, Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('prompt')
  async getPrompt() {
    return { global_prompt: await this.settings.getGlobalPrompt() };
  }

  @Put('prompt')
  @HttpCode(200)
  async setPrompt(@Body() body: { global_prompt?: unknown }) {
    if (typeof body.global_prompt !== 'string') throw new BadRequestException('global_prompt must be a string');
    return { global_prompt: await this.settings.setGlobalPrompt(body.global_prompt) };
  }
}
