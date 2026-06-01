import { Controller, Post, Get, Patch, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RequestStatus } from '@prisma/client';
import { ExpertRequestsService } from './expert-requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

enum UzmanAllowedRequestStatus {
  UZMANA_YONLENDIRILDI = 'UZMANA_YONLENDIRILDI',
  TAMAMLANDI = 'TAMAMLANDI',
  REDDEDILDI = 'REDDEDILDI',
}

class UpdateMyRequestStatusDto {
  @IsEnum(UzmanAllowedRequestStatus)
  status: UzmanAllowedRequestStatus;
}

@ApiTags('requests')
@Controller('experts')
export class ExpertRequestsController {
  constructor(private readonly service: ExpertRequestsService) {}

  @Roles('UZMAN')
  @Get('me/requests')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Kendi gelen taleplerim (uzman)' })
  getMyRequests(@CurrentUser() user: User) {
    return this.service.getMyRequests(user.id);
  }

  @Roles('UZMAN')
  @Patch('me/requests/:id/status')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Talep durumunu güncelle (uzman)' })
  @ApiParam({ name: 'id', description: 'Talep UUID' })
  updateMyRequestStatus(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMyRequestStatusDto,
  ) {
    return this.service.updateMyRequestStatus(user.id, id, dto.status as RequestStatus);
  }

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
