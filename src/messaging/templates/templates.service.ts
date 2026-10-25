import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TemplateCategory,
  TemplateStatus,
  WhatsAppTemplate,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { countVariables, validateTemplateBody } from '../template-render';
import { CreateTemplateDto } from './dto/create-template.dto';
import { MetaTemplatesClient } from './meta-templates.client';
import {
  bodyTextOf,
  mapMetaCategory,
  mapMetaStatus,
  reasonOrNull,
  templateKey,
} from './template-mapping';

const DEFAULT_LANGUAGE = 'tr';

export interface TemplateFilter {
  status?: TemplateStatus;
  category?: TemplateCategory;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaTemplatesClient,
  ) {}

  list(filter: TemplateFilter): Promise<WhatsAppTemplate[]> {
    return this.prisma.whatsAppTemplate.findMany({
      where: { status: filter.status, category: filter.category },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Meta'daki şablonları yerel kayda yazar. Meta'da olmayanlar silinmez,
  // DISABLED olarak işaretlenir.
  async sync(): Promise<{ synced: number; disabled: number }> {
    this.meta.assertConfigured();
    const remote = await this.meta.listAll();
    const syncedAt = new Date();
    const seen = new Set<string>();
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    for (const template of remote) {
      const { name, language } = template;
      const bodyText = bodyTextOf(template.components);
      seen.add(templateKey(name, language));
      const data = {
        metaId: template.id,
        name,
        language,
        category: mapMetaCategory(template.category),
        status: mapMetaStatus(template.status),
        bodyText,
        variableCount: countVariables(bodyText),
        components: (template.components ??
          []) as unknown as Prisma.InputJsonValue,
        rejectedReason: reasonOrNull(template.rejected_reason),
        lastSyncedAt: syncedAt,
      };
      ops.push(
        this.prisma.whatsAppTemplate.upsert({
          where: { name_language: { name, language } },
          create: data,
          update: data,
        }),
      );
    }

    const active = await this.prisma.whatsAppTemplate.findMany({
      where: { status: { not: TemplateStatus.DISABLED } },
      select: { id: true, name: true, language: true },
    });
    const missingIds = active
      .filter((row) => !seen.has(templateKey(row.name, row.language)))
      .map((row) => row.id);
    if (missingIds.length > 0) {
      ops.push(
        this.prisma.whatsAppTemplate.updateMany({
          where: { id: { in: missingIds } },
          data: { status: TemplateStatus.DISABLED, lastSyncedAt: syncedAt },
        }),
      );
    }

    await this.prisma.$transaction(ops);
    return { synced: remote.length, disabled: missingIds.length };
  }

  // Panelden şablon oluşturur ve Meta onayına gönderir. Kayıt PENDING olur.
  async create(dto: CreateTemplateDto): Promise<WhatsAppTemplate> {
    this.meta.assertConfigured();
    try {
      validateTemplateBody(dto.bodyText);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const variables = countVariables(dto.bodyText);
    if (dto.examples.length !== variables) {
      throw new BadRequestException(
        `Örnek sayısı değişken sayısıyla (${variables}) eşleşmeli`,
      );
    }

    const language = dto.language ?? DEFAULT_LANGUAGE;
    const exists = await this.prisma.whatsAppTemplate.findUnique({
      where: { name_language: { name: dto.name, language } },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException('Bu isimde şablon zaten var');
    }

    const result = await this.meta.create({
      name: dto.name,
      language,
      category: dto.category,
      bodyText: dto.bodyText,
      examples: dto.examples,
    });

    return this.prisma.whatsAppTemplate.create({
      data: {
        metaId: result.id ?? null,
        name: dto.name,
        language,
        category: dto.category,
        status: TemplateStatus.PENDING,
        bodyText: dto.bodyText,
        variableCount: variables,
        components: [
          { type: 'BODY', text: dto.bodyText },
        ] as Prisma.InputJsonValue,
      },
    });
  }

  // Meta'dan siler, kaydı DISABLED yapar.
  async delete(id: string): Promise<WhatsAppTemplate> {
    this.meta.assertConfigured();
    const row = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Şablon bulunamadı');
    }

    await this.meta.delete(row.name);
    return this.prisma.whatsAppTemplate.update({
      where: { id },
      data: { status: TemplateStatus.DISABLED, lastSyncedAt: new Date() },
    });
  }

  // Gönderim servisi için: kayıt var ve onaylı olmalı.
  async getApproved(id: string): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
    });
    if (!row || row.status !== TemplateStatus.APPROVED) {
      throw new BadRequestException('Şablon bulunamadı veya onaylı değil');
    }
    return row;
  }
}
