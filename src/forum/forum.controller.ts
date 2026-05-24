import { Controller, Get, Post, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ForumService } from './forum.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('forum')
@Controller('forum')
export class ForumController {
  constructor(private readonly forumService: ForumService) {}

  @Roles('DANISAN')
  @Post('questions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Soru sor', description: 'Soru ONAY_BEKLIYOR statüsünde oluşur, admin onayladıktan sonra bir uzmana atanır.' })
  @ApiResponse({ status: 201, description: 'Soru oluşturuldu' })
  createQuestion(@CurrentUser() user: User, @Body() dto: CreateQuestionDto) {
    return this.forumService.createQuestion(user, dto);
  }

  @Public()
  @Get('questions')
  @ApiOperation({ summary: 'Onaylı sorular (public)', description: 'Sadece CEVAPLANDI ve admin onaylı sorular listelenir.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  findAll(@Query('page') page = '1', @Query('limit') limit = '10') {
    return this.forumService.findAllPublic(+page, +limit);
  }

  @Public()
  @Get('questions/:id')
  @ApiOperation({ summary: 'Soru detayı + onaylı cevaplar' })
  @ApiParam({ name: 'id', description: 'Soru UUID' })
  @ApiResponse({ status: 404, description: 'Soru bulunamadı veya henüz cevaplanmamış' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.forumService.findOnePublic(id);
  }

  @Roles('UZMAN')
  @Get('me/questions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Bana atanan sorular', description: 'Uzmanın cevaplamakla sorumlu olduğu sorular.' })
  getAssignedQuestions(@CurrentUser() user: User) {
    return this.forumService.getAssignedQuestions(user.id);
  }

  @Roles('UZMAN')
  @Post('questions/:id/answers')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Soruyu cevapla', description: 'Sadece kendisine atanmış soruları cevaplayabilir. Cevap admin onayına gider.' })
  @ApiParam({ name: 'id', description: 'Soru UUID' })
  @ApiResponse({ status: 403, description: 'Bu soru size atanmamış' })
  createAnswer(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAnswerDto,
  ) {
    return this.forumService.createAnswer(user.id, id, dto);
  }
}
