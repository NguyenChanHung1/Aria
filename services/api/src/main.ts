import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config, ensureStorage } from './config';
import { UploadExceptionFilter } from './ingestion/upload-exception.filter';

async function bootstrap() {
  await ensureStorage();
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new UploadExceptionFilter());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
