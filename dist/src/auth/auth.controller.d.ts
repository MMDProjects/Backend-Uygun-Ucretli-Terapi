import { AuthService } from './auth.service';
import { RegisterDanisanDto } from './dto/register-danisan.dto';
import { RegisterUzmanDto } from './dto/register-uzman.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
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
    refresh(user: {
        id: string;
        refreshToken: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(dto: RefreshTokenDto): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
}
