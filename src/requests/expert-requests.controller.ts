import { Controller, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ExpertRequestsService } from './expert-requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('requests')
@Controller('experts')
export class ExpertRequestsController {
  constructor(private readonly service: ExpertRequestsService) {}

  @Roles('DANISAN')
  @Post(':id/requests')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Uzmana talep gönder', description: 'Uzman detay sayfasından gönderilen form. Talep BEKLEMEDE statüsüyle admin paneline düşer.' })
  @ApiParam({ name: 'id', description: 'Uzman profil UUID' })
  @ApiResponse({ status: 201, description: 'Talep oluşturuldu' })
  @ApiResponse({ status: 404, description: 'Uzman bulunamadı' })
  create(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) expertId: string,
    @Body() dto: CreateRequestDto,
  ) {
    return this.service.create(user, expertId, dto);
  }
}
