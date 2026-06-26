import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RostersService } from './rosters.service';

@Controller('rosters')
export class RostersController {
  constructor(private readonly rostersService: RostersService) {}

  @Get()
  findAll() {
    return this.rostersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rostersService.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.rostersService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.rostersService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rostersService.remove(id);
  }
}