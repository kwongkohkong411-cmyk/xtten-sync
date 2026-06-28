import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Public()
  @Get('releases')
  getReleases(@Req() req: Request) {
    const protocol =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ||
      req.protocol ||
      'http';
    const host = req.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;
    return this.agentService.getReleases(baseUrl);
  }

  @Public()
  @Get('download/windows')
  downloadWindows(
    @Query('format') format: 'exe' | 'msi' = 'exe',
    @Res() res: Response,
  ) {
    const target = this.agentService.resolveDownload('windows', format);
    if (!target?.available) {
      throw new NotFoundException(
        `Windows installer (${format}) is not published yet. Build desktop package first.`,
      );
    }
    return res.download(target.filePath, target.fileName);
  }

  @Public()
  @Get('download/macos')
  downloadMacos(
    @Query('format') format: 'dmg' | 'pkg' = 'dmg',
    @Res() res: Response,
  ) {
    const target = this.agentService.resolveDownload('macos', format);
    if (!target?.available) {
      throw new NotFoundException(
        `macOS installer (${format}) is not published yet.`,
      );
    }
    return res.download(target.filePath, target.fileName);
  }
}
