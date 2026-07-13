import { Body, Controller, Get, Headers, Param, Patch } from '@nestjs/common';
import { AnalysisService } from './analysis.service';

@Controller('projects/:projectId/inputs/:inputId/interpretation')
export class InterpretationsController {
  constructor(private readonly analysis: AnalysisService) {}
  @Get() get(@Param('projectId') projectId: string, @Param('inputId') inputId: string) { return this.analysis.get(projectId, inputId); }
  @Get('history') history(@Param('projectId') projectId: string, @Param('inputId') inputId: string) { return this.analysis.history(projectId, inputId); }
  @Patch() patch(@Param('projectId') projectId: string, @Param('inputId') inputId: string, @Body() body: Record<string, unknown>, @Headers('x-editor-id') editorId?: string) { return this.analysis.correct(projectId, inputId, body, editorId?.trim() || 'local-user'); }
}
