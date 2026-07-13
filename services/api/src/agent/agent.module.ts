import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AgentClient } from './agent.client';

@Module({ imports: [SettingsModule], providers: [AgentClient], exports: [AgentClient] })
export class AgentModule {}
