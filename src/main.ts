import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true captures the raw request body so the webhook can verify the
  // GitHub HMAC signature over the exact bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // 400 on unknown properties
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`Helmsman control plane on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
