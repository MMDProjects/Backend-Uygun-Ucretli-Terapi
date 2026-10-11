# Nginx: gercek istemci IP'sini API'ye iletme

API (`psiko_api`) nginx arkasinda calisir. Nginx gercek IP'yi iletmezse
backend her istegi `127.0.0.1`'den geliyor gorur ve rate limit (dakikada 100)
**butun kullanicilar icin tek kota** gibi isler. Belirti: admin musaitlik
tablosunda bazi uzmanlarin rastgele bos gorunmesi, girislerde 429.

Backend tarafi `app.set('trust proxy', 1)` ile hazir (`src/main.ts`).
Sunucuda yapilacak tek is, `/etc/nginx/sites-enabled/psiko` icindeki
`location /api/` bloguna su satirlari eklemek:

```nginx
location /api/ {
    proxy_pass http://localhost:4000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`X-Forwarded-For` bilerek `$proxy_add_x_forwarded_for` degil `$remote_addr`:
istemcinin gonderdigi sahte bir `X-Forwarded-For` basligi boylece ezilir ve
kota atlatilamaz.

Uygulama sirasi (once yedek, restart degil reload):

```bash
cp /etc/nginx/sites-enabled/psiko /root/psiko.nginx.bak-$(date +%F)
# duzenle
nginx -t && systemctl reload nginx
```

`nginx -t` hata verirse reload yapmayin; yedekten geri donun.
