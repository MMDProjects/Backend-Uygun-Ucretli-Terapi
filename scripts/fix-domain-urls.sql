-- Domain değişikliği sonrası kırık dosya linklerini düzeltir.
-- caremer.online -> yecamer.com.tr
--
-- ÖNEMLİ: Önce SELECT sorgularını çalıştırıp kaç kayıt etkileneceğini görün.
-- UPDATE'leri çalıştırmadan önce veritabanının yedeğini alın.

-- ============================================================
-- 1. ADIM: Etkilenecek kayıtları önizle (hiçbir şeyi değiştirmez)
-- ============================================================

SELECT id, "avatarUrl", "certificateUrl", "cvUrl",
       "pendingAvatarUrl", "pendingCertificateUrl", "pendingCvUrl"
FROM expert_profiles
WHERE "avatarUrl" LIKE '%caremer.online%'
   OR "certificateUrl" LIKE '%caremer.online%'
   OR "cvUrl" LIKE '%caremer.online%'
   OR "pendingAvatarUrl" LIKE '%caremer.online%'
   OR "pendingCertificateUrl" LIKE '%caremer.online%'
   OR "pendingCvUrl" LIKE '%caremer.online%';

SELECT id, "coverImageUrl", "pendingCoverImageUrl"
FROM blogs
WHERE "coverImageUrl" LIKE '%caremer.online%'
   OR "pendingCoverImageUrl" LIKE '%caremer.online%';

-- Toplam etkilenecek kayıt sayısı
SELECT
  (SELECT count(*) FROM expert_profiles
    WHERE "avatarUrl" LIKE '%caremer.online%'
       OR "certificateUrl" LIKE '%caremer.online%'
       OR "cvUrl" LIKE '%caremer.online%'
       OR "pendingAvatarUrl" LIKE '%caremer.online%'
       OR "pendingCertificateUrl" LIKE '%caremer.online%'
       OR "pendingCvUrl" LIKE '%caremer.online%'
  ) AS expert_profiles_affected,
  (SELECT count(*) FROM blogs
    WHERE "coverImageUrl" LIKE '%caremer.online%'
       OR "pendingCoverImageUrl" LIKE '%caremer.online%'
  ) AS blogs_affected;


-- ============================================================
-- 2. ADIM: Güncellemeleri tek transaction içinde uygula
-- Yukarıdaki SELECT sonuçlarını kontrol ettikten ve yedek
-- aldıktan sonra bu bloğu çalıştırın.
-- ============================================================

BEGIN;

UPDATE expert_profiles
SET
  "avatarUrl" = replace("avatarUrl", 'caremer.online', 'yecamer.com.tr'),
  "certificateUrl" = replace("certificateUrl", 'caremer.online', 'yecamer.com.tr'),
  "cvUrl" = replace("cvUrl", 'caremer.online', 'yecamer.com.tr'),
  "pendingAvatarUrl" = replace("pendingAvatarUrl", 'caremer.online', 'yecamer.com.tr'),
  "pendingCertificateUrl" = replace("pendingCertificateUrl", 'caremer.online', 'yecamer.com.tr'),
  "pendingCvUrl" = replace("pendingCvUrl", 'caremer.online', 'yecamer.com.tr')
WHERE "avatarUrl" LIKE '%caremer.online%'
   OR "certificateUrl" LIKE '%caremer.online%'
   OR "cvUrl" LIKE '%caremer.online%'
   OR "pendingAvatarUrl" LIKE '%caremer.online%'
   OR "pendingCertificateUrl" LIKE '%caremer.online%'
   OR "pendingCvUrl" LIKE '%caremer.online%';

UPDATE blogs
SET
  "coverImageUrl" = replace("coverImageUrl", 'caremer.online', 'yecamer.com.tr'),
  "pendingCoverImageUrl" = replace("pendingCoverImageUrl", 'caremer.online', 'yecamer.com.tr')
WHERE "coverImageUrl" LIKE '%caremer.online%'
   OR "pendingCoverImageUrl" LIKE '%caremer.online%';

-- Değişiklikleri kontrol edin, sorun yoksa COMMIT; yanlışsa ROLLBACK yazıp çalıştırın.
COMMIT;
-- ROLLBACK;


-- ============================================================
-- 3. ADIM: Doğrulama — artık 0 satır dönmeli
-- ============================================================

SELECT count(*) AS remaining_expert_profiles
FROM expert_profiles
WHERE "avatarUrl" LIKE '%caremer.online%'
   OR "certificateUrl" LIKE '%caremer.online%'
   OR "cvUrl" LIKE '%caremer.online%'
   OR "pendingAvatarUrl" LIKE '%caremer.online%'
   OR "pendingCertificateUrl" LIKE '%caremer.online%'
   OR "pendingCvUrl" LIKE '%caremer.online%';

SELECT count(*) AS remaining_blogs
FROM blogs
WHERE "coverImageUrl" LIKE '%caremer.online%'
   OR "pendingCoverImageUrl" LIKE '%caremer.online%';
