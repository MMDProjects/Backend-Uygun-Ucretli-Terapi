import * as fs from 'fs';
import * as path from 'path';

// D2 migration veri güncellemesi: randevusu olan mevcut kişiler DANISAN olmalı.
describe('D2 migration veri güncellemesi', () => {
  const migrationPath = path.join(
    __dirname,
    '..',
    '..',
    'prisma',
    'migrations',
    '20261025220000_add_operator_features',
    'migration.sql',
  );

  // Yorumları ve fazla boşlukları temizleyip ifadeleri sırayla döner.
  const statements = (): string[] =>
    fs
      .readFileSync(migrationPath, 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((statement) => statement.replace(/\s+/g, ' ').trim())
      .filter((statement) => statement.length > 0);

  it('randevusu olan kişileri DANISAN yapan UPDATE ifadesini içerir', () => {
    expect(statements()).toContain(
      'UPDATE "contacts" SET "lifecycleStatus" = \'DANISAN\' WHERE "id" IN (SELECT DISTINCT "contactId" FROM "appointments")',
    );
  });

  it('veri güncellemesi migration içindeki son ifadedir', () => {
    expect(statements()[statements().length - 1]).toMatch(
      /^UPDATE "contacts" SET/,
    );
  });
});
