export interface MetaWebhookEntry {
  id: string;
  changes?: MetaWhatsAppChange[];
  messaging?: MetaInstagramMessagingEvent[];
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
}

export interface MetaWebhookBody {
  object: 'whatsapp_business_account' | 'instagram' | string;
  entry: MetaWebhookEntry[];
}
