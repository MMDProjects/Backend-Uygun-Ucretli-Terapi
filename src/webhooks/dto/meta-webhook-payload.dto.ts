export interface MetaWebhookEntry {
  id: string;
  changes?: MetaWhatsAppChange[];
  messaging?: MetaInstagramMessagingEvent[];
  // Instagram bekleme modu: sahiplik başka bir uygulamadayken gelen olaylar.
  standby?: MetaInstagramMessagingEvent[];
}

// WhatsApp mesaj durum olayı (sent / delivered / read / failed).
export interface MetaWhatsAppStatus {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}

export interface MetaWhatsAppChange {
  field: string;
  value: {
    messaging_product: 'whatsapp';
    metadata: { phone_number_id: string; display_phone_number: string };
    contacts?: { profile: { name: string }; wa_id: string }[];
    messages?: {
      id: string;
      from: string;
      timestamp: string;
      type: string;
      text?: { body: string };
    }[];
    statuses?: MetaWhatsAppStatus[];
    // message_template_status_update olayının alanları.
    event?: string;
    message_template_id?: number | string;
    message_template_name?: string;
    message_template_language?: string;
    reason?: string | null;
  };
}

export interface MetaInstagramMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
  };
  // Danışanın okuma bildirimi; watermark okunan son mesajın zamanıdır (ms).
  read?: { mid?: string; watermark?: number };
}

export interface MetaWebhookBody {
  object: string; // 'whatsapp_business_account' | 'instagram' | ileride başka
  entry: MetaWebhookEntry[];
}
