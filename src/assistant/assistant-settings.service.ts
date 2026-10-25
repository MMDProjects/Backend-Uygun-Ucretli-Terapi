import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssistantMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 5000;
const MAX_NOTICE_CHARS = 1000;

export interface AssistantSettingsView {
  mode: AssistantMode;
  envEnabled: boolean;
  effectiveMode: AssistantMode;
  noticeText: string | null;
}

@Injectable()
export class AssistantSettingsService {
  private readonly logger = new Logger(AssistantSettingsService.name);
  private cache: { value: AssistantMode; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get envEnabled(): boolean {
    return this.config.get<string>('ASSISTANT_ENABLED') === 'true';
  }

  // ASSISTANT_ENABLED ana şalter: kapalıysa veritabanı ayarı ne olursa olsun OFF.
  async getEffectiveMode(): Promise<AssistantMode> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;

    let value: AssistantMode = AssistantMode.OFF;
    if (this.envEnabled) {
      const setting = await this.prisma.systemSetting.findFirst({
        select: { assistantMode: true },
      });
      value = setting?.assistantMode ?? AssistantMode.OFF;
    }

    this.cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  }

  async getSettings(): Promise<AssistantSettingsView> {
    const setting = await this.prisma.systemSetting.findFirst({
      select: { assistantMode: true, assistantNoticeText: true },
    });
    const effectiveMode = await this.getEffectiveMode();
    return {
      mode: setting?.assistantMode ?? AssistantMode.OFF,
      envEnabled: this.envEnabled,
      effectiveMode,
      noticeText: setting?.assistantNoticeText ?? null,
    };
  }

  async updateSettings(
    input: { mode?: AssistantMode; noticeText?: string | null },
    actorUserId: string,
  ): Promise<AssistantSettingsView> {
    const setting = await this.prisma.systemSetting.findFirst({
      select: { id: true },
    });
    if (!setting) {
      throw new NotFoundException(
        'Sistem ayarı bulunamadı; önce site ayarları oluşturulmalı.',
      );
    }

    const data: {
      assistantMode?: AssistantMode;
      assistantNoticeText?: string | null;
    } = {};
    if (input.mode !== undefined) data.assistantMode = input.mode;
    if (input.noticeText !== undefined) {
      const text = input.noticeText?.trim() ?? '';
      if (text.length > MAX_NOTICE_CHARS) {
        throw new BadRequestException(
          `Bilgilendirme metni en fazla ${MAX_NOTICE_CHARS} karakter olabilir.`,
        );
      }
      data.assistantNoticeText = text === '' ? null : text;
    }

    await this.prisma.systemSetting.update({
      where: { id: setting.id },
      data,
    });
    this.cache = null;

    this.logger.log(
      `Asistan ayarı güncellendi (kullanıcı: ${actorUserId}): ${JSON.stringify({
        mode: input.mode,
        noticeText: input.noticeText === undefined ? undefined : 'değişti',
      })}`,
    );

    return this.getSettings();
  }
}
