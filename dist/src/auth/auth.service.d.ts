import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDanisanDto } from './dto/register-danisan.dto';
import { RegisterUzmanDto } from './dto/register-uzman.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
export declare class AuthService {
    private prisma;
    private jwt;
    private config;
    private mail;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService, mail: MailService);
    registerDanisan(dto: RegisterDanisanDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    registerUzman(dto: RegisterUzmanDto, files: {
        certificate?: Express.Multer.File[];
        cv?: Express.Multer.File[];
    }): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    refresh(userId: string, oldRefreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(refreshToken: string): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    private generateTokens;
}
