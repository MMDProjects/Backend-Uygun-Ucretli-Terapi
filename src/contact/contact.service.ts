import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  constructor(private prisma: PrismaService, private mail: MailService) {}

  async create(dto: CreateContactDto) {
    const form = await this.prisma.contactForm.create({ data: dto });
    await this.mail.sendContactConfirmation(dto.email, dto.fullName);
    return { message: 'Mesajınız alındı', id: form.id };
  }
}
