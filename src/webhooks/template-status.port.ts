import { MetaWhatsAppChange } from './dto/meta-webhook-payload.dto';

// Şablon durum olayını işleyen bağlantı noktası. Şablon modülü bu jetonla
// bağlanır; webhook denetleyicisi şablon modülüne doğrudan bağlı değildir.
export const TEMPLATE_STATUS_PORT = 'TEMPLATE_STATUS_PORT';

export interface TemplateStatusPort {
  handle(value: MetaWhatsAppChange['value']): Promise<void>;
}
