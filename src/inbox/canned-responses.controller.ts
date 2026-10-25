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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CannedResponsesService } from './canned-responses.service';
import {
  CreateCannedResponseDto,
  ListCannedResponsesQueryDto,
  UpdateCannedResponseDto,
} from './dto/canned-response.dto';

@ApiTags('admin-inbox')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/inbox/canned-responses')
export class CannedResponsesController {
  constructor(private readonly cannedResponses: CannedResponsesService) {}

  @Get()
  list(@Query() query: ListCannedResponsesQueryDto) {
    return this.cannedResponses.list(query.q);
  }

  @Post()
  create(
    @Body() dto: CreateCannedResponseDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.cannedResponses.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCannedResponseDto,
  ) {
    return this.cannedResponses.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.cannedResponses.remove(id);
  }
}
