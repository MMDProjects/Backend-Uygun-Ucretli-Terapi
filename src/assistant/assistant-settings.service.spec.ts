import { ConfigService } from '@nestjs/config';
import { AssistantMode } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssistantSettingsService } from './assistant-settings.service';

function buildPrisma(setting: any) {
  return {
    systemSetting: {
      findFirst: jest.fn<any, any>().mockResolvedValue(setting),
      update: jest.fn<any, any>().mockResolvedValue(undefined),
    },
  };
}

function buildConfig(enabled: boolean) {
  return {
    get: jest.fn((key: string) =>
      key === 'ASSISTANT_ENABLED' ? (enabled ? 'true' : 'false') : undefined,
    ),
  };
}

describe('AssistantSettingsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('ASSISTANT_ENABLED kapalıyken DB modu LIVE olsa da OFF döner', async () => {
    const prisma = buildPrisma({ assistantMode: AssistantMode.LIVE });
    const service = new AssistantSettingsService(
      prisma as unknown as PrismaService,
      buildConfig(false) as unknown as ConfigService,
    );
    expect(await service.getEffectiveMode()).toBe(AssistantMode.OFF);
  });

  it('ASSISTANT_ENABLED açıkken DB modunu döner', async () => {
    const prisma = buildPrisma({ assistantMode: AssistantMode.SHADOW });
    const service = new AssistantSettingsService(
      prisma as unknown as PrismaService,
      buildConfig(true) as unknown as ConfigService,
    );
    expect(await service.getEffectiveMode()).toBe(AssistantMode.SHADOW);
  });

  it('kayıt yoksa OFF döner', async () => {
    const prisma = buildPrisma(null);
    const service = new AssistantSettingsService(
      prisma as unknown as PrismaService,
      buildConfig(true) as unknown as ConfigService,
    );
    expect(await service.getEffectiveMode()).toBe(AssistantMode.OFF);
  });

  it('sonucu 5 sn önbelleğe alır ve güncellemede temizler', async () => {
    const prisma = buildPrisma({ assistantMode: AssistantMode.LIVE, id: 's1' });
    const service = new AssistantSettingsService(
      prisma as unknown as PrismaService,
      buildConfig(true) as unknown as ConfigService,
    );
    expect(await service.getEffectiveMode()).toBe(AssistantMode.LIVE);
    prisma.systemSetting.findFirst.mockResolvedValue({
      assistantMode: AssistantMode.SHADOW,
      id: 's1',
    });
    expect(await service.getEffectiveMode()).toBe(AssistantMode.LIVE);
    expect(prisma.systemSetting.findFirst).toHaveBeenCalledTimes(1);

    await service.updateSettings({ mode: AssistantMode.SHADOW }, 'user-1');
    expect(await service.getEffectiveMode()).toBe(AssistantMode.SHADOW);
  });

  it('kayıt yokken güncelleme 404 verir ve kayıt oluşturmaz', async () => {
    const prisma = buildPrisma(null) as any;
    prisma.systemSetting.create = jest.fn();
    const service = new AssistantSettingsService(
      prisma,
      buildConfig(true) as unknown as ConfigService,
    );
    await expect(
      service.updateSettings({ mode: AssistantMode.LIVE }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.systemSetting.create).not.toHaveBeenCalled();
  });

  it('boş bilgilendirme metnini null yapar', async () => {
    const prisma = buildPrisma({ id: 's1', assistantMode: AssistantMode.OFF });
    const service = new AssistantSettingsService(
      prisma as unknown as PrismaService,
      buildConfig(true) as unknown as ConfigService,
    );
    await service.updateSettings({ noticeText: '   ' }, 'user-1');
    expect(prisma.systemSetting.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { assistantNoticeText: null },
    });
  });
});
