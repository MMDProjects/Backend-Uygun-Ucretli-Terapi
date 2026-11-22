// Onaylı şablonu getiren bağlantı noktası. Şablon modülü bu jetonla bağlanır;
// yoksa şablonla gönderim 503 döner. getApproved, şablon APPROVED değilse
// BadRequest fırlatmalıdır.
export const APPROVED_TEMPLATE_PORT = 'APPROVED_TEMPLATE_PORT';

export interface ApprovedTemplate {
  id: string;
  name: string;
  language: string;
  bodyText: string;
  variableCount: number;
}

export interface ApprovedTemplatePort {
  getApproved(id: string): Promise<ApprovedTemplate>;
}
