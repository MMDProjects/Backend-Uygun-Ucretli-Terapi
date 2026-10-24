import { paginated, parsePagination } from './pagination';

describe('parsePagination', () => {
  it('geçersiz page değerlerinde 1 döner', () => {
    expect(parsePagination('abc').page).toBe(1);
    expect(parsePagination('0').page).toBe(1);
    expect(parsePagination('-3').page).toBe(1);
    expect(parsePagination('1.5').page).toBe(1);
    expect(parsePagination('1,2').page).toBe(1);
    expect(parsePagination(undefined).page).toBe(1);
  });

  it('geçerli page değerini ve skip değerini hesaplar', () => {
    expect(parsePagination('3', '10')).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
    });
  });

  it('geçersiz limit değerlerinde varsayılan limiti (20) kullanır', () => {
    expect(parsePagination('1', 'abc').limit).toBe(20);
    expect(parsePagination('1', '0').limit).toBe(20);
    expect(parsePagination('1', '-5').limit).toBe(20);
    expect(parsePagination('1', '1.5').limit).toBe(20);
    expect(parsePagination('1', undefined).limit).toBe(20);
  });

  it('limit üst sınırı 100 ile sınırlar', () => {
    expect(parsePagination('1', '100000').limit).toBe(100);
    expect(parsePagination('1', '100').limit).toBe(100);
    expect(parsePagination('1', '99').limit).toBe(99);
  });

  it('opts ile varsayılan ve üst sınır değiştirilebilir', () => {
    expect(parsePagination('1', 'abc', { defaultLimit: 50 }).limit).toBe(50);
    expect(parsePagination('1', '500', { maxLimit: 200 }).limit).toBe(200);
  });

  it('dizi gelirse ilk elemanı kullanır', () => {
    expect(parsePagination(['2', '9'], ['5', '7'])).toEqual({
      page: 2,
      limit: 5,
      skip: 5,
    });
  });

  it('sayı girdilerini de kabul eder', () => {
    expect(parsePagination(2, 30)).toEqual({ page: 2, limit: 30, skip: 30 });
  });
});

describe('paginated', () => {
  it('{ data, total, page, limit } zarfı döner', () => {
    expect(paginated([{ id: 1 }], 5, 2, 10)).toEqual({
      data: [{ id: 1 }],
      total: 5,
      page: 2,
      limit: 10,
    });
  });
});
