import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';
import { REFRESH_GRACE_MS } from '../auth.constants';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET')!,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { sub: string }) {
    const refreshToken = (req.body as { refreshToken?: string }).refreshToken;
    if (!refreshToken) throw new UnauthorizedException();

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (!stored || stored.expiresAt < new Date())
      throw new UnauthorizedException();

    // Rotasyonla revoke edilmiş token, hoşgörü penceresi içindeyse hâlâ kabul edilir
    // (çok sekme / çift F5'te eşzamanlı refresh istekleri). Pencere dışıysa 401.
    // Guard service'ten önce çalıştığı için bu kontrol burada da şart.
    if (
      stored.revokedAt &&
      Date.now() - stored.revokedAt.getTime() > REFRESH_GRACE_MS
    ) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException();

    return { ...user, refreshToken };
  }
}
