import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { TemplatesService } from './templates.service';

@Roles('ADMIN')
@Controller('admin/whatsapp/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Query() query: ListTemplatesQueryDto) {
    return this.templates.list(query);
  }

  @Post('sync')
  sync() {
    return this.templates.sync();
  }

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templates.delete(id);
  }
}
