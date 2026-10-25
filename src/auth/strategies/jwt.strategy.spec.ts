import type { Request } from 'express';
import { tokenFromStreamQuery } from './jwt.strategy';

function fakeReq(url: string, query: Record<string, unknown> = {}) {
  return { originalUrl: url, url, query } as unknown as Request;
}

describe('tokenFromStreamQuery', () => {
  it('normal bir uç noktada ?token= değerini yok sayar', () => {
    expect(
      tokenFromStreamQuery(fakeReq('/admin/users?token=abc', { token: 'abc' })),
    ).toBeNull();
  });

  it('inbox SSE akışında ?token= değerini kabul eder', () => {
    expect(
      tokenFromStreamQuery(
        fakeReq('/admin/inbox/stream?token=abc', { token: 'abc' }),
      ),
    ).toBe('abc');
  });

  it('bildirim SSE akışında ?token= değerini kabul eder', () => {
    expect(
      tokenFromStreamQuery(
        fakeReq('/notifications/stream?token=abc', { token: 'abc' }),
      ),
    ).toBe('abc');
  });

  it('akış yolunda token yoksa null döner', () => {
    expect(tokenFromStreamQuery(fakeReq('/admin/inbox/stream', {}))).toBeNull();
  });

  it('token dizi olarak gelirse null döner', () => {
    expect(
      tokenFromStreamQuery(
        fakeReq('/admin/inbox/stream?token=a&token=b', { token: ['a', 'b'] }),
      ),
    ).toBeNull();
  });

  it('originalUrl yoksa url alanına bakar', () => {
    const req = {
      url: '/notifications/stream?token=xyz',
      query: { token: 'xyz' },
    } as unknown as Request;
    expect(tokenFromStreamQuery(req)).toBe('xyz');
  });
});
