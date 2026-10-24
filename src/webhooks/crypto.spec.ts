import {
  hmacSha256Hex,
  timingSafeStringEqual,
  parseAppSecrets,
  verifyHmacSha256Signature,
} from './crypto';

describe('hmacSha256Hex', () => {
  it('aynı secret ve payload için her zaman aynı sonucu üretir', () => {
    const a = hmacSha256Hex('secret', 'payload');
    const b = hmacSha256Hex('secret', 'payload');
    expect(a).toBe(b);
  });

  it('farklı secret farklı sonuç üretir', () => {
    const a = hmacSha256Hex('secret-1', 'payload');
    const b = hmacSha256Hex('secret-2', 'payload');
    expect(a).not.toBe(b);
  });
});

describe('timingSafeStringEqual', () => {
  it('eşit stringlerde true döner', () => {
    expect(timingSafeStringEqual('abc', 'abc')).toBe(true);
  });

  it('farklı stringlerde false döner', () => {
    expect(timingSafeStringEqual('abc', 'abd')).toBe(false);
  });

  it('farklı uzunluktaki stringlerde hata fırlatmadan false döner', () => {
    expect(timingSafeStringEqual('abc', 'abcd')).toBe(false);
  });
});

describe('parseAppSecrets', () => {
  it('undefined için boş dizi döner', () => {
    expect(parseAppSecrets(undefined)).toEqual([]);
  });

  it('boş string için boş dizi döner', () => {
    expect(parseAppSecrets('')).toEqual([]);
  });

  it('tek secret içeren stringi parse eder', () => {
    expect(parseAppSecrets('secret-1')).toEqual(['secret-1']);
  });

  it('virgülle ayrılmış, boşluklu birden fazla secreti parse eder', () => {
    expect(parseAppSecrets(' secret-1 , secret-2,secret-3 ')).toEqual([
      'secret-1',
      'secret-2',
      'secret-3',
    ]);
  });

  it('boş girdileri atlar', () => {
    expect(parseAppSecrets('secret-1,,secret-2,')).toEqual([
      'secret-1',
      'secret-2',
    ]);
  });
});

describe('verifyHmacSha256Signature', () => {
  const secret = 'test-secret';
  const body = '{"field":"value"}';
  const validSignature = 'sha256=' + hmacSha256Hex(secret, body);

  it('secret listesi boşsa reddeder (fail closed)', () => {
    expect(verifyHmacSha256Signature(body, validSignature, [])).toBe(false);
  });

  it('signature header yoksa reddeder', () => {
    expect(verifyHmacSha256Signature(body, null, [secret])).toBe(false);
    expect(verifyHmacSha256Signature(body, undefined, [secret])).toBe(false);
  });

  it('sha256= öneki yoksa reddeder', () => {
    const raw = hmacSha256Hex(secret, body);
    expect(verifyHmacSha256Signature(body, raw, [secret])).toBe(false);
  });

  it('doğru secret ve geçerli imza ile kabul eder', () => {
    expect(verifyHmacSha256Signature(body, validSignature, [secret])).toBe(true);
  });

  it('yanlış secret ile reddeder', () => {
    expect(verifyHmacSha256Signature(body, validSignature, ['wrong-secret'])).toBe(
      false,
    );
  });

  it('body değişmişse reddeder', () => {
    expect(
      verifyHmacSha256Signature('{"field":"tampered"}', validSignature, [secret]),
    ).toBe(false);
  });

  it('çoklu secret listesinde herhangi biri eşleşirse kabul eder', () => {
    expect(
      verifyHmacSha256Signature(body, validSignature, ['wrong-secret', secret]),
    ).toBe(true);
  });
});
