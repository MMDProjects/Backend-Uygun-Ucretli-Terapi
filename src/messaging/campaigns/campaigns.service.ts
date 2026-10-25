import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignStatus,
  Prisma,
  RecipientStatus,
  WhatsAppTemplate,
} from '@prisma/client';
import { renderTemplate } from '../template-render';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated, parsePagination } from '../../common/pagination';
import { refreshCampaignCounts } from './campaign-counts';
import {
  buildContactWhere,
  ContactFilter,
  normalizeContactFilter,
} from '../contacts/contact-filter';
import {
  buildTemplateParams,
  estimateCost,
  evaluateEligibility,
  isTemplateUsable,
  ParamMappingItem,
  ratio,
  readParamMapping,
  EligibilitySkipReason,
  validateParamMapping,
} from './campaign-rules';
import {
  CreateCampaignDto,
  ListCampaignsQueryDto,
  ListRecipientsQueryDto,
  UpdateCampaignDto,
  UpdateCampaignSettingsDto,
  UpdateRecipientsDto,
} from './dto/campaign.dto';

const CAMPAIGN_NOT_FOUND = 'Kampanya bulunamadı.';
const NOT_EDITABLE = 'Bu kampanya düzenlenemez.';
const CAMPAIGNS_DISABLED = 'Toplu mesaj ayarlardan kapalı';
const NOT_READY = 'Kampanya gönderime hazır değil. Önce hazırlayın.';
const NO_RECIPIENTS = 'Gönderilecek alıcı yok.';
const NO_AUDIENCE = 'Hedef kitle seçilmedi (liste ya da filtre).';
const TEMPLATE_NOT_USABLE =
  'Şablon onaylı olmalı ve kimlik doğrulama kategorisinde olmamalı.';
const FAILED_PREVIEW_LIMIT = 100;

const RECIPIENT_SELECT = {
  id: true,
  included: true,
  status: true,
  skipReason: true,
  attempts: true,
  messageId: true,
  error: true,
  sentAt: true,
  contact: { select: { id: true, fullName: true, phone: true } },
} as const;

export interface CampaignSettingsRow {
  id: string;
  campaignsEnabled: boolean;
  campaignUnitPrice: Prisma.Decimal | null;
  reminderQuietStart: number;
  reminderQuietEnd: number;
}

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  // Ayar satırı yoksa varsayılanlarla oluşturulur (varsayılan: kapalı).
  async loadSettings(): Promise<CampaignSettingsRow> {
    const existing = await this.prisma.systemSetting.findFirst();
    if (existing) return existing;
    return this.prisma.systemSetting.create({
      data: {
        whatsappNumber: '+905000000000',
        instagramUrl: 'https://instagram.com/psikodanismanlik',
        logoUrl: '/uploads/logo.png',
      },
    });
  }

  async getSettings() {
    return this.settingsView(await this.loadSettings());
  }

  async updateSettings(dto: UpdateCampaignSettingsDto) {
    const current = await this.loadSettings();
    const updated = await this.prisma.systemSetting.update({
      where: { id: current.id },
      data: {
        ...(dto.campaignsEnabled !== undefined
          ? { campaignsEnabled: dto.campaignsEnabled }
          : {}),
        ...(dto.campaignUnitPrice !== undefined
          ? { campaignUnitPrice: dto.campaignUnitPrice }
          : {}),
      },
    });
    return this.settingsView(updated);
  }

  async list(query: ListCampaignsQueryDto) {
    const { page, limit, skip } = parsePagination(query.page, query.limit, {
      maxLimit: 100,
    });
    const where: Prisma.CampaignWhereInput = query.status
      ? { status: query.status }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          template: { select: { id: true, name: true, status: true } },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return paginated(rows, total, page, limit);
  }

  async findDetail(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            language: true,
            category: true,
            status: true,
            bodyText: true,
            variableCount: true,
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException(CAMPAIGN_NOT_FOUND);
    return campaign;
  }

  async create(dto: CreateCampaignDto, userId?: string) {
    const template = await this.requireUsableTemplate(dto.templateId);
    const mapping: ParamMappingItem[] = dto.paramMapping ?? [];
    validateParamMapping(mapping, template.variableCount);
    const listIds = [...new Set(dto.listIds ?? [])];
    await this.ensureListsExist(listIds);

    return this.prisma.campaign.create({
      data: {
        name: dto.name.trim(),
        templateId: template.id,
        paramMapping: mapping as unknown as Prisma.InputJsonValue,
        listIds,
        ...(dto.audienceFilter
          ? {
              audienceFilter: normalizeContactFilter(
                dto.audienceFilter,
              ) as unknown as Prisma.InputJsonValue,
            }
          : {}),
        createdById: userId ?? null,
      },
    });
  }

  // Hedef, şablon ya da eşleme değişirse hazırlık geçersizleşir: READY → DRAFT.
  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.findDetail(id);
    if (!isEditable(campaign.status)) throw new ConflictException(NOT_EDITABLE);

    const templateId = dto.templateId ?? campaign.templateId;
    const template = await this.requireUsableTemplate(templateId);
    const mapping: ParamMappingItem[] =
      dto.paramMapping ?? readParamMapping(campaign.paramMapping);
    validateParamMapping(mapping, template.variableCount);

    const listIds =
      dto.listIds !== undefined ? [...new Set(dto.listIds)] : campaign.listIds;
    if (dto.listIds !== undefined) await this.ensureListsExist(listIds);

    const audienceChanged =
      dto.templateId !== undefined ||
      dto.paramMapping !== undefined ||
      dto.listIds !== undefined ||
      dto.audienceFilter !== undefined;

    let audienceFilter:
      | Prisma.InputJsonValue
      | typeof Prisma.DbNull
      | undefined;
    if (dto.audienceFilter === null) {
      audienceFilter = Prisma.DbNull;
    } else if (dto.audienceFilter) {
      audienceFilter = normalizeContactFilter(
        dto.audienceFilter,
      ) as unknown as Prisma.InputJsonValue;
    }

    const status =
      audienceChanged && campaign.status === CampaignStatus.READY
        ? CampaignStatus.DRAFT
        : campaign.status;

    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        templateId: template.id,
        paramMapping: mapping as unknown as Prisma.InputJsonValue,
        listIds,
        ...(audienceFilter !== undefined ? { audienceFilter } : {}),
        status,
      },
    });
  }

  // Hedef kitleyi (liste ∪ filtre) alıcılara dönüştürür. Müşterinin elle
  // yaptığı seçimler (included=false) korunur.
  async prepare(id: string) {
    const campaign = await this.findDetail(id);
    if (!isEditable(campaign.status)) {
      throw new ConflictException('Bu kampanya hazırlanamaz.');
    }
    const template = await this.requireUsableTemplate(campaign.templateId);
    validateParamMapping(
      readParamMapping(campaign.paramMapping),
      template.variableCount,
    );

    const filter = campaign.audienceFilter as unknown as ContactFilter | null;
    if (campaign.listIds.length === 0 && !filter) {
      throw new BadRequestException(NO_AUDIENCE);
    }
    // Silinmiş liste sessizce 0 kişi üretmesin: önce hedefi doğrula.
    await this.ensureListsExist(campaign.listIds);

    const audienceIds = new Set<string>();
    if (campaign.listIds.length > 0) {
      const members = await this.prisma.contactListMember.findMany({
        where: { listId: { in: campaign.listIds } },
        select: { contactId: true },
      });
      members.forEach((m) => audienceIds.add(m.contactId));
    }
    if (filter) {
      const matches = await this.prisma.contact.findMany({
        where: buildContactWhere(filter),
        select: { id: true },
      });
      matches.forEach((m) => audienceIds.add(m.id));
    }

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: [...audienceIds] } },
      select: {
        id: true,
        phone: true,
        contactType: true,
        marketingOptOut: true,
        reminderOptOut: true,
      },
    });
    const existing = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: id },
      select: { contactId: true, included: true, status: true },
    });
    const existingById = new Map(existing.map((r) => [r.contactId, r]));

    const skipCounts: Record<EligibilitySkipReason, number> = {
      no_phone: 0,
      not_client: 0,
      opt_out: 0,
      invalid_phone: 0,
    };
    let eligibleCount = 0;
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.campaignRecipient.deleteMany({
        where: {
          campaignId: id,
          contactId: { notIn: contacts.map((c) => c.id) },
        },
      }),
    ];

    for (const contact of contacts) {
      const verdict = evaluateEligibility(contact);
      const prev = existingById.get(contact.id);
      let data: Prisma.CampaignRecipientUncheckedUpdateInput;
      if (!verdict.eligible) {
        skipCounts[verdict.reason] += 1;
        data = {
          status: RecipientStatus.SKIPPED,
          skipReason: verdict.reason,
          included: false,
        };
      } else {
        eligibleCount += 1;
        // Önceden kural dışı kalan kayıt yeniden değerlendirilir; elle
        // kaldırılmış (PENDING ve included=false) seçim korunur.
        const keepIncluded =
          prev !== undefined && prev.status !== RecipientStatus.SKIPPED;
        data = {
          status: RecipientStatus.PENDING,
          skipReason: null,
          ...(keepIncluded ? {} : { included: true }),
        };
      }
      operations.push(
        this.prisma.campaignRecipient.upsert({
          where: {
            campaignId_contactId: { campaignId: id, contactId: contact.id },
          },
          create: {
            campaignId: id,
            contactId: contact.id,
            ...(verdict.eligible
              ? { status: RecipientStatus.PENDING, included: true }
              : {
                  status: RecipientStatus.SKIPPED,
                  skipReason: verdict.reason,
                  included: false,
                }),
          },
          update: data,
        }),
      );
    }

    await this.prisma.$transaction(operations);
    await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.READY },
    });
    await this.recountFor(id);

    return {
      campaignId: id,
      total: contacts.length,
      eligible: eligibleCount,
      skipped: skipCounts,
    };
  }

  async listRecipients(id: string, query: ListRecipientsQueryDto) {
    await this.findDetail(id);
    const { page, limit, skip } = parsePagination(query.page, query.limit, {
      maxLimit: 100,
    });
    const where: Prisma.CampaignRecipientWhereInput = {
      campaignId: id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.included !== undefined ? { included: query.included } : {}),
      ...(query.q
        ? {
            contact: {
              OR: [
                { fullName: { contains: query.q, mode: 'insensitive' } },
                { phone: { contains: query.q } },
              ],
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.campaignRecipient.findMany({
        where,
        select: RECIPIENT_SELECT,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.campaignRecipient.count({ where }),
    ]);
    return paginated(rows, total, page, limit);
  }

  // Yalnızca bekleyen alıcılar değiştirilebilir; atlananlar elle dahil edilemez.
  async updateRecipients(id: string, dto: UpdateRecipientsDto) {
    const campaign = await this.findDetail(id);
    if (!isEditable(campaign.status)) throw new ConflictException(NOT_EDITABLE);
    const result = await this.prisma.campaignRecipient.updateMany({
      where: {
        campaignId: id,
        contactId: { in: dto.contactIds },
        status: RecipientStatus.PENDING,
      },
      data: { included: dto.included },
    });
    await this.recountFor(id);
    return { updated: result.count };
  }

  async preview(id: string) {
    const campaign = await this.findDetail(id);
    const recipient = await this.prisma.campaignRecipient.findFirst({
      where: {
        campaignId: id,
        included: true,
        status: RecipientStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      select: { contact: { select: { fullName: true } } },
    });
    if (!recipient) {
      return { text: null, recipientName: null };
    }
    const params = buildTemplateParams(
      readParamMapping(campaign.paramMapping),
      campaign.template.variableCount,
      recipient.contact,
    );
    return {
      text: renderTemplate(campaign.template.bodyText, params),
      recipientName: recipient.contact.fullName,
    };
  }

  async estimate(id: string) {
    await this.findDetail(id);
    const [sendCount, settings] = await Promise.all([
      this.countSendable(id),
      this.loadSettings(),
    ]);
    const unitPrice =
      settings.campaignUnitPrice === null
        ? null
        : Number(settings.campaignUnitPrice);
    return {
      sendCount,
      unitPrice,
      estimatedCost: estimateCost(sendCount, unitPrice),
      currency: 'TRY',
    };
  }

  async send(id: string) {
    return this.start(id, null);
  }

  async schedule(id: string, at: Date) {
    if (at.getTime() <= Date.now()) {
      throw new BadRequestException('Zamanlama gelecekte olmalı.');
    }
    return this.start(id, at);
  }

  async cancel(id: string) {
    const campaign = await this.findDetail(id);
    if (
      campaign.status === CampaignStatus.COMPLETED ||
      campaign.status === CampaignStatus.CANCELLED
    ) {
      throw new ConflictException('Bu kampanya iptal edilemez.');
    }
    await this.prisma.$transaction([
      this.prisma.campaignRecipient.updateMany({
        where: { campaignId: id, status: RecipientStatus.PENDING },
        data: { status: RecipientStatus.SKIPPED, skipReason: 'cancelled' },
      }),
      this.prisma.campaign.update({
        where: { id },
        data: { status: CampaignStatus.CANCELLED },
      }),
    ]);
    await this.recountFor(id);
    return this.findDetail(id);
  }

  async report(id: string) {
    const campaign = await this.findDetail(id);
    const [failedRecipients, errorGroups, skipGroups] = await Promise.all([
      this.prisma.campaignRecipient.findMany({
        where: { campaignId: id, status: RecipientStatus.FAILED },
        select: {
          error: true,
          attempts: true,
          contact: { select: { id: true, fullName: true, phone: true } },
        },
        take: FAILED_PREVIEW_LIMIT,
      }),
      this.prisma.campaignRecipient.groupBy({
        by: ['error'],
        where: { campaignId: id, status: RecipientStatus.FAILED },
        _count: { _all: true },
      }),
      this.prisma.campaignRecipient.groupBy({
        by: ['skipReason'],
        where: { campaignId: id, status: RecipientStatus.SKIPPED },
        _count: { _all: true },
      }),
    ]);
    return {
      campaignId: id,
      status: campaign.status,
      recipientCount: campaign.recipientCount,
      sentCount: campaign.sentCount,
      deliveredCount: campaign.deliveredCount,
      readCount: campaign.readCount,
      repliedCount: campaign.repliedCount,
      failedCount: campaign.failedCount,
      skippedCount: campaign.skippedCount,
      rates: {
        delivery: ratio(campaign.deliveredCount, campaign.sentCount),
        read: ratio(campaign.readCount, campaign.deliveredCount),
        reply: ratio(campaign.repliedCount, campaign.sentCount),
        failure: ratio(campaign.failedCount, campaign.recipientCount),
      },
      failedRecipients: failedRecipients.map((r) => ({
        contact: r.contact,
        attempts: r.attempts,
        error: r.error,
      })),
      errorReasons: errorGroups.map((g) => ({
        error: g.error,
        count: g._count._all,
      })),
      skipReasons: skipGroups.map((g) => ({
        reason: g.skipReason,
        count: g._count._all,
      })),
    };
  }

  // Sayaçları alıcı durumlarından yeniden hesaplar. Açık alıcı kalmadıysa
  // gönderilen kampanya COMPLETED olur.
  async recountFor(campaignId: string): Promise<void> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true },
    });
    if (!campaign) return;

    const open = await refreshCampaignCounts(this.prisma, campaignId);
    if (campaign.status === CampaignStatus.SENDING && open === 0) {
      await this.prisma.campaign.updateMany({
        where: { id: campaignId, status: CampaignStatus.SENDING },
        data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
      });
    }
  }

  private async start(id: string, scheduledAt: Date | null) {
    const settings = await this.loadSettings();
    if (!settings.campaignsEnabled) {
      throw new BadRequestException(CAMPAIGNS_DISABLED);
    }
    const campaign = await this.findDetail(id);
    if (campaign.status !== CampaignStatus.READY) {
      throw new BadRequestException(NOT_READY);
    }
    await this.requireUsableTemplate(campaign.templateId);
    if ((await this.countSendable(id)) === 0) {
      throw new BadRequestException(NO_RECIPIENTS);
    }

    const result = await this.prisma.campaign.updateMany({
      where: { id, status: CampaignStatus.READY },
      data: scheduledAt
        ? { status: CampaignStatus.SCHEDULED, scheduledAt }
        : {
            status: CampaignStatus.SENDING,
            startedAt: new Date(),
          },
    });
    if (result.count === 0) throw new ConflictException(NOT_READY);
    return this.findDetail(id);
  }

  private countSendable(campaignId: string): Promise<number> {
    return this.prisma.campaignRecipient.count({
      where: {
        campaignId,
        included: true,
        status: RecipientStatus.PENDING,
      },
    });
  }

  private settingsView(settings: CampaignSettingsRow) {
    return {
      campaignsEnabled: settings.campaignsEnabled,
      campaignUnitPrice:
        settings.campaignUnitPrice === null
          ? null
          : Number(settings.campaignUnitPrice),
    };
  }

  private async requireUsableTemplate(
    templateId: string,
  ): Promise<WhatsAppTemplate> {
    const template = await this.prisma.whatsAppTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template || !isTemplateUsable(template)) {
      throw new BadRequestException(TEMPLATE_NOT_USABLE);
    }
    return template;
  }

  private async ensureListsExist(listIds: string[]): Promise<void> {
    if (listIds.length === 0) return;
    const count = await this.prisma.contactList.count({
      where: { id: { in: listIds } },
    });
    if (count !== listIds.length) {
      throw new BadRequestException('Liste bulunamadı.');
    }
  }
}

function isEditable(status: CampaignStatus): boolean {
  return status === CampaignStatus.DRAFT || status === CampaignStatus.READY;
}
