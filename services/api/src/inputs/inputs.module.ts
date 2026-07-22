import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { InputsController } from './inputs.controller';
import { InputsService } from './inputs.service';

@Module({
  imports: [ArtifactsModule],
  controllers: [InputsController],
  providers: [InputsService],
  exports: [InputsService],
})
export class InputsModule {}
