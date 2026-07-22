import { Body, Controller, Param, Post } from '@nestjs/common';
import { InputsService } from './inputs.service';

@Controller('projects/:projectId/inputs')
export class InputsController {
  constructor(private readonly inputs: InputsService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() body: Record<string, unknown>) {
    return this.inputs.createTextInput(projectId, body);
  }
}
