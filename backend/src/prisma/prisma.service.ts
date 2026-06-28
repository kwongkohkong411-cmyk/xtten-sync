import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

type ClosableApp = {
  close: () => Promise<unknown>;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('✅ Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('❌ Prisma disconnected');
  }

  // 可选：开发时方便调试
  enableShutdownHooks(app: ClosableApp) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}
