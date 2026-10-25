import 'reflect-metadata';
import { InboxModule } from '../inbox/inbox.module';
import { APPROVED_TEMPLATE_PORT } from '../inbox/approved-template.port';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { TEMPLATE_STATUS_PORT } from '../webhooks/template-status.port';
import { MessagingModule } from './messaging.module';
import { TemplatesService } from './templates/templates.service';
import { TemplateStatusHandler } from './templates/template-status.handler';

// Modül bağlantılarını doğrular: portlar gerçek sağlayıcılara bağlı olmalı.
// Üretimde port bağlanmazsa şablon gönderimi 503 döner ve durum olayları
// sessizce yok sayılır; bu test o regresyonu yakalar.
type ProviderDef = { provide?: unknown; useExisting?: unknown };

function providersOf(moduleClass: object): ProviderDef[] {
  return (Reflect.getMetadata('providers', moduleClass) ?? []) as ProviderDef[];
}

function importsOf(moduleClass: object): unknown[] {
  return (Reflect.getMetadata('imports', moduleClass) ?? []) as unknown[];
}

describe('Mesajlaşma modülleri bağlantıları', () => {
  it('InboxModule onaylı şablon portunu TemplatesService ile bağlar', () => {
    expect(importsOf(InboxModule)).toContain(MessagingModule);
    const port = providersOf(InboxModule).find(
      (p) => p.provide === APPROVED_TEMPLATE_PORT,
    );
    expect(port?.useExisting).toBe(TemplatesService);
  });

  it('WebhooksModule şablon durum portunu TemplateStatusHandler ile bağlar', () => {
    expect(importsOf(WebhooksModule)).toContain(MessagingModule);
    const port = providersOf(WebhooksModule).find(
      (p) => p.provide === TEMPLATE_STATUS_PORT,
    );
    expect(port?.useExisting).toBe(TemplateStatusHandler);
  });

  it('MessagingModule bu iki sağlayıcıyı dışa açar', () => {
    const exported = (Reflect.getMetadata('exports', MessagingModule) ??
      []) as unknown[];
    expect(exported).toEqual(
      expect.arrayContaining([TemplatesService, TemplateStatusHandler]),
    );
  });
});
