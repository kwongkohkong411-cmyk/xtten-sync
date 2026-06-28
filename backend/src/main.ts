import { NestFactory } from '@nestjs/core';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigin = (origin?: string) => {
    if (!origin) return true;

    const localhostPattern = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    const lanPattern =
      /^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/;
    return localhostPattern.test(origin) || lanPattern.test(origin);
  };

  // =========================
  // CORS FIX（就是你现在报错原因）
  // =========================
  const corsOriginHandler: NonNullable<CorsOptions['origin']> = (
    origin,
    callback,
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (typeof origin === 'string' && allowedOrigin(origin)) {
      callback(null, origin);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  };

  app.enableCors({
    origin: corsOriginHandler,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-company-id',
      'companyid',
    ],
  });

  const uploadsRoot = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsRoot)) {
    mkdirSync(uploadsRoot, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsRoot));

  await app.listen(3000, '0.0.0.0');
}
void bootstrap();
