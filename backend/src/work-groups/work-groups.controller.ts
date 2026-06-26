import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { WorkGroupsService } from './work-groups.service';

@Controller('work-groups')
export class WorkGroupsController {
  constructor(private readonly workGroupsService: WorkGroupsService) {}

  @Get()
  findAll() {
    return this.workGroupsService.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.workGroupsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.workGroupsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workGroupsService.remove(id);
  }
}