import {
  canAdvance,
  describeMetaError,
  mapMetaStatus,
  recipientCounterDelta,
} from './delivery-status';

describe('delivery-status', () => {
  describe('mapMetaStatus', () => {
    it('Meta durum adlarını iç duruma çevirir', () => {
      expect(mapMetaStatus('sent')).toBe('SENT');
      expect(mapMetaStatus('delivered')).toBe('DELIVERED');
      expect(mapMetaStatus('read')).toBe('READ');
      expect(mapMetaStatus('failed')).toBe('FAILED');
      expect(mapMetaStatus('bilinmeyen')).toBeNull();
    });
  });

  describe('canAdvance', () => {
    it('durum yalnızca ileriye gider', () => {
      expect(canAdvance(null, 'SENT')).toBe(true);
      expect(canAdvance('SENT', 'DELIVERED')).toBe(true);
      expect(canAdvance('DELIVERED', 'READ')).toBe(true);
      expect(canAdvance('READ', 'DELIVERED')).toBe(false);
      expect(canAdvance('DELIVERED', 'SENT')).toBe(false);
      expect(canAdvance('READ', 'READ')).toBe(false);
    });

    it('başarısız yalnızca iletilmemiş mesaja uygulanır', () => {
      expect(canAdvance(null, 'FAILED')).toBe(true);
      expect(canAdvance('SENT', 'FAILED')).toBe(true);
      expect(canAdvance('DELIVERED', 'FAILED')).toBe(false);
      expect(canAdvance('READ', 'FAILED')).toBe(false);
    });

    it('terminal durumlar ilerletilmez', () => {
      expect(canAdvance('FAILED', 'DELIVERED')).toBe(false);
      expect(canAdvance('REPLIED', 'READ')).toBe(false);
      expect(canAdvance('SKIPPED', 'SENT')).toBe(false);
    });

    it('kampanya alıcısında bekleyen ve gönderiliyor durumları sıfır sayılır', () => {
      expect(canAdvance('SENDING', 'SENT')).toBe(true);
      expect(canAdvance('PENDING', 'DELIVERED')).toBe(true);
    });
  });

  describe('recipientCounterDelta', () => {
    it('SENT -> DELIVERED yalnızca iletildi sayacını artırır', () => {
      expect(recipientCounterDelta('SENT', 'DELIVERED')).toEqual({
        sent: 0,
        delivered: 1,
        read: 0,
        failed: 0,
        replied: 0,
      });
    });

    it('atlanan ara adımlar da sayılır (SENT -> READ)', () => {
      expect(recipientCounterDelta('SENT', 'READ')).toEqual({
        sent: 0,
        delivered: 1,
        read: 1,
        failed: 0,
        replied: 0,
      });
    });

    it('FAILED ve REPLIED kendi sayacını artırır', () => {
      expect(recipientCounterDelta('SENT', 'FAILED').failed).toBe(1);
      expect(recipientCounterDelta('READ', 'REPLIED').replied).toBe(1);
    });
  });

  describe('describeMetaError', () => {
    it('ilk hatanın başlığını ve kodunu birleştirir', () => {
      expect(
        describeMetaError([
          { code: 131047, title: 'Yeniden deneme penceresi' },
        ]),
      ).toBe('Yeniden deneme penceresi (kod 131047)');
    });

    it('hata yoksa null döner', () => {
      expect(describeMetaError(undefined)).toBeNull();
      expect(describeMetaError([])).toBeNull();
    });
  });
});
