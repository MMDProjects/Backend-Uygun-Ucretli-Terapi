## Ne yapildi

<!-- Kisa ozet. Hangi sorunu cozuyor? -->

## Nasil test edildi

<!-- Calistirilan komutlar, elle dogrulanan senaryolar -->

## Kontrol listesi

- [ ] Dal `test`'ten acildi (main'e PR ise kaynak `test` veya `hotfix/*`)
- [ ] `npm run lint:check` ve `npm run typecheck` yerelde temiz
- [ ] `npm run test:ci` ve `npm run test:e2e:ci` yesil
- [ ] Prisma semasi degistiyse migration uretildi (`prisma migrate dev`)
- [ ] Yeni ortam degiskeni eklendiyse `.env.example` guncellendi
- [ ] Prod davranisi degisiyorsa geri alma plani dusunuldu

## Terfi

<!-- Bu PR test'e mi main'e mi gidiyor? main ise deploy tetiklenecegini unutma. -->
