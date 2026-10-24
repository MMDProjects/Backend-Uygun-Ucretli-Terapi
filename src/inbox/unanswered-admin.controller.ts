import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { KnowledgeAdminService } from './knowledge-admin.service';
import { ResolveUnansweredDto } from './dto/resolve-unanswered.dto';

@Roles('ADMIN')
@Controller('admin/unanswered')
export class UnansweredAdminController {
  constructor(private readonly knowledge: KnowledgeAdminService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.knowledge.listUnanswered({
      status,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Post(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveUnansweredDto,
  ) {
    return this.knowledge.resolveUnanswered(id, dto);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.dismissUnanswered(id);
  }
}
