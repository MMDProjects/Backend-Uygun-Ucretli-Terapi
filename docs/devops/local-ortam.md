# Local Ortam

Projenin tamami tek komutla ayaga kalkar: Postgres + MinIO + API + Web.

## Gereksinim

- Docker Desktop calisir durumda
- `backend/` ve `frontend/` repolari **kardes klasorler** olarak clone'lanmis olmali:

```
Uygun-Ucretli-Terapi/
├── backend/     (bu repo)
└── frontend/    (Frontend-Uygun-Ucretli-Terapi)
```

Frontend imaji `../frontend` yolundan build edilir; klasor adi onemlidir.

## Calistirma

Ust klasorde bu dosyayi include eden bir `docker-compose.yml` varsa:

```bash
docker compose up -d --build     # ilk kurulum
docker compose up -d             # sonraki acilislar (~15 sn)
docker compose down              # durdur (veri kalir)
docker compose down -v           # durdur + veritabani/dosyalari sil
docker compose logs -f api       # log takibi
```

Yalnizca bu repo elinizdeyse:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

## Adresler

| Servis        | Adres                                                     |
| ------------- | --------------------------------------------------------- |
| Web           | http://localhost:3000                                     |
| API           | http://localhost:4000                                     |
| Swagger       | http://localhost:4000/api/docs                            |
| Health        | http://localhost:4000/health                              |
| MinIO konsolu | http://localhost:9001 (`psikoadmin` / `psiko_minio_2026`) |
| Postgres      | `localhost:5432` (`psiko` / `psiko1234` / `psikodb`)      |

## Seed hesabi

| E-posta           | Sifre       | Rol   |
| ----------------- | ----------- | ----- |
| `admin@psiko.com` | `Admin123!` | ADMIN |

Seed idempotenttir; her `up`'ta yeniden calisir, cift kayit uretmez.

## Ortam degiskenleri

`docker-compose.local.yml` icine gomuludur — temiz bir clone'da hicbir `.env`
hazirlamadan calisir. Oradaki degerler **yalnizca local** icindir, gercek
secret degildir. Mail gonderimi kapalidir (`BREVO_API_KEY` bos): sifre sifirlama
ve bildirim mailleri gonderilmez, API log'una duser.

Uygulamayi Docker disinda (`npm run start:dev`) kosturacaksan `.env.example`'i
`.env` olarak kopyala; oradaki host adlari `localhost`'tur.

## Sema nasil kuruluyor

`db-init` servisi `prisma db push` calistirir, `prisma migrate deploy` DEGIL.

Sebep: `prisma/migrations` su an `schema.prisma`'nin gerisinde (availabilities
`dayOfWeek` -> `date`, blogs `pending*`, system_settings `wheelWinnerIndices`).
Migration'lari uygulamak eksik sema uretir. `db push` semayi birebir uygular ve
migration gecmisine dokunmaz. Kayma giderildiginde bu adim `migrate deploy`'a
donmelidir — bkz. `.github/workflows/ci.yml` icindeki `migration-check` notu.

## Sorun giderme

| Belirti                     | Sebep / cozum                                                         |
| --------------------------- | --------------------------------------------------------------------- |
| `api` unhealthy kaliyor     | `docker compose logs api`. Cogunlukla sema/DB baglantisi.             |
| Port 3000/4000 dolu         | Baska bir dev sunucusu calisiyor; once onu kapat.                     |
| `web` build cok uzun        | Ilk build Next derlemesi yapar (birkac dakika). Sonrakiler cache'ten. |
| Sema degistirdim, yansimadi | `docker compose up -d --build db-init` ya da `down -v` ile sifirla.   |
