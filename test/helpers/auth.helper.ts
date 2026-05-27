/**
 * JWT token üretici — test ortamında gerçek JWT imzalar.
 * process.env.JWT_ACCESS_SECRET = 'test-secret' ile eşleşmelidir.
 */
import * as jwt from 'jsonwebtoken';
import {
  MOCK_DANISAN_ID,
  MOCK_UZMAN_ID,
  MOCK_ADMIN_ID,
} from './prisma-mock';

export const TEST_JWT_SECRET = 'test-secret';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

export function signToken(payload: TokenPayload, expiresIn = '15m'): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

/** DANISAN rolü için Bearer token */
export function danisanToken(): string {
  return signToken({
    sub: MOCK_DANISAN_ID,
    email: 'danisan@test.com',
    role: 'DANISAN',
  });
}

/** UZMAN rolü için Bearer token */
export function uzmanToken(): string {
  return signToken({
    sub: MOCK_UZMAN_ID,
    email: 'uzman@test.com',
    role: 'UZMAN',
  });
}

/** ADMIN rolü için Bearer token */
export function adminToken(): string {
  return signToken({
    sub: MOCK_ADMIN_ID,
    email: 'admin@test.com',
    role: 'ADMIN',
  });
}

/** Authorization header değeri */
export function bearerHeader(token: string): string {
  return `Bearer ${token}`;
}
