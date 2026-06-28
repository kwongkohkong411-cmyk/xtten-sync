import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacCoreService } from './rbac-core.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [RbacCoreService],
  exports: [RbacCoreService],
})
export class RbacCoreModule {}
