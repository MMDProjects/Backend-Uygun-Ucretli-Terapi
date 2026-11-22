import {
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AssistantService } from '../assistant/assistant.service';
import { OpenAiUnavailableError } from '../assistant/openai.client';
import { PreviewAssistantDto } from './dto/preview-assistant.dto';

// Elif'e sor: verilen mesaja Elif'in vereceği cevabın önizlemesi.
@Roles('ADMIN')
@Controller('admin/assistant')
export class AssistantPreviewController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('preview')
  async preview(@Body() dto: PreviewAssistantDto) {
    try {
      return await this.assistant.previewReply(dto.message);
    } catch (error) {
      if (error instanceof OpenAiUnavailableError) {
        throw new ServiceUnavailableException('OpenAI anahtarı tanımlı değil');
      }
      throw error;
    }
  }
}
