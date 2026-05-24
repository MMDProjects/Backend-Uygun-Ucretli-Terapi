import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('contact')
@Public()
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @ApiOperation({ summary: 'İletişim formu gönder', description: 'Form admin paneline düşer. Gönderen e-postaya otomatik onay maili gider.' })
  @ApiResponse({ status: 201, schema: { example: { message: 'Mesajınız alındı', id: 'uuid' } } })
  create(@Body() dto: CreateContactDto) {
    return this.contactService.create(dto);
  }
}
