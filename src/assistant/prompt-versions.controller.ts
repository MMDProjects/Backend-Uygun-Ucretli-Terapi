import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Channel } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AssistantService } from './assistant.service';
import { OpenAiUnavailableError } from './openai.client';
import {
  CreatePromptVersionDto,
  TestPromptDto,
} from './dto/prompt-version.dto';
import { PromptVersionsService } from './prompt-versions.service';

// Elif promptunun panelden yönetimi. Yalnızca ADMIN.
@Roles('ADMIN')
@Controller('admin/assistant/prompts')
export class PromptVersionsController {
  constructor(
    private readonly prompts: PromptVersionsService,
    private readonly assistant: AssistantService,
  ) {}

  @Get()
  list() {
    return this.prompts.list();
  }

  // Sabit yol, ":id" yolundan önce tanımlanmalı.
  @Get('active')
  active() {
    return this.prompts.getActive();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prompts.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreatePromptVersionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.prompts.create(
      {
        content: dto.content,
        whatsappAddendum: dto.whatsappAddendum,
        instagramAddendum: dto.instagramAddendum,
        note: dto.note,
        activate: dto.activate,
      },
      user.id,
    );
  }

  @Post('deactivate')
  deactivate(@CurrentUser() user: { id: string }) {
    return this.prompts.deactivate(user.id);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.prompts.activate(id, user.id);
  }

  // Geçici prompt ile önizleme. Kayıt, gönderim ve araç çalıştırma yok.
  @Post('test')
  async test(@Body() dto: TestPromptDto) {
    this.prompts.validateContent(dto.content);
    try {
      return await this.assistant.previewReply(dto.message, {
        promptOverride: dto.content,
        addendaOverride: {
          whatsappAddendum: dto.whatsappAddendum,
          instagramAddendum: dto.instagramAddendum,
        },
        channel:
          dto.channel === 'INSTAGRAM' ? Channel.INSTAGRAM : Channel.WHATSAPP,
      });
    } catch (error) {
      if (error instanceof OpenAiUnavailableError) {
        throw new ServiceUnavailableException('OpenAI anahtarı tanımlı değil');
      }
      throw error;
    }
  }
}
