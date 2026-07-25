// Rotasyon sonrası eski refresh token'ın kabul edilmeye devam ettiği pencere.
// Çok sekmeli kullanım ve art arda hızlı sayfa yenilemelerinde (çift F5) eşzamanlı
// refresh istekleri aynı token'ı gönderir; pencere olmadan ikincisi 401 alıp
// oturumu düşürür.
export const REFRESH_GRACE_MS = 60_000;
