import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';
declare const JwtRefreshStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtRefreshStrategy extends JwtRefreshStrategy_base {
    private prisma;
    constructor(config: ConfigService, prisma: PrismaService);
    validate(req: Request, payload: {
        sub: string;
    }): Promise<{
        refreshToken: string;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        passwordHash: string;
        role: import("@prisma/client").$Enums.Role;
        isActive: boolean;
        passwordResetToken: string | null;
        passwordResetExpires: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
export {};
