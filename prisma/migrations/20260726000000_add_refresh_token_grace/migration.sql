-- Refresh token rotasyonuna hoşgörü penceresi: hard-delete yerine soft-revoke.
-- revokedAt NULL = hiç kullanılmamış token; dolu = rotasyon zamanı.
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

-- Kullanıcı bazlı fırsatçı temizlik (deleteMany by userId) için indeks.
CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
