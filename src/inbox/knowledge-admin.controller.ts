import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { KnowledgeAdminService } from './knowledge-admin.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

@Roles('ADMIN')
@Controller('admin/knowledge')
export class KnowledgeAdminController {
  constructor(private readonly knowledge: KnowledgeAdminService) {}

  @Get()
  list(
    @Query('source') source?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.knowledge.listKnowledge({
      source,
      q,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Post()
  create(@Body() dto: CreateKnowledgeDto) {
    return this.knowledge.createKnowledge(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeDto,
  ) {
    return this.knowledge.updateKnowledge(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.deleteKnowledge(id);
  }
}
