import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('comments')
@Controller('experts')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Roles('DANISAN')
  @Post(':id/comments')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Yorum bırak', description: 'Yorum admin onayından geçtikten sonra yayınlanır ve uzmanın rating ortalaması güncellenir.' })
  @ApiParam({ name: 'id', description: 'Uzman profil UUID' })
  @ApiResponse({ status: 201, description: 'Yorum oluşturuldu, onay bekleniyor' })
  create(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) expertId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(user, expertId, dto);
  }

  @Public()
  @Get(':id/comments')
  @ApiOperation({ summary: 'Uzman yorumları (public)', description: 'Sadece admin onaylı yorumlar döner.' })
  @ApiParam({ name: 'id', description: 'Uzman profil UUID' })
  findApproved(@Param('id', ParseUUIDPipe) expertId: string) {
    return this.commentsService.findApproved(expertId);
  }
}
