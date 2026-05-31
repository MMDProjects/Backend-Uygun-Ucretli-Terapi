import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDanisanDto } from './dto/register-danisan.dto';
import { RegisterUzmanDto } from './dto/register-uzman.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register/danisan')
  @ApiOperation({ summary: 'Danışan kaydı', description: 'Yeni bir danışan hesabı oluşturur ve token döner.' })
  @ApiResponse({ status: 201, description: 'Kayıt başarılı', schema: { example: { accessToken: 'eyJ...', refreshToken: 'eyJ...' } } })
  @ApiResponse({ status: 409, description: 'E-posta zaten kayıtlı' })
  registerDanisan(@Body() dto: RegisterDanisanDto) {
    return this.authService.registerDanisan(dto);
  }

  @Public()
  @Post('register/uzman')
  @ApiOperation({ summary: 'Uzman kaydı (PDF upload)', description: 'Sertifika ve CV PDF zorunludur. multipart/form-data ile gönderilmeli.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['firstName', 'lastName', 'email', 'phone', 'password', 'title', 'kvkkConsent', 'certificate', 'cv'],
      properties: {
        firstName: { type: 'string', example: 'Dr. Ayşe' },
        lastName: { type: 'string', example: 'Kara' },
        email: { type: 'string', example: 'ayse@psiko.com' },
        phone: { type: 'string', example: '05331234567' },
        password: { type: 'string', example: 'Sifre1234!' },
        title: { type: 'string', example: 'Uzman Klinik Psikolog' },
        kvkkConsent: { type: 'boolean', example: true },
        certificate: { type: 'string', format: 'binary', description: 'Sertifika PDF (max 10MB)' },
        cv: { type: 'string', format: 'binary', description: 'CV PDF (max 10MB)' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Uzman kaydı oluşturuldu, admin onayı bekleniyor' })
  @ApiResponse({ status: 400, description: 'PDF dosyası eksik' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'certificate', maxCount: 1 },
        { name: 'cv', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        fileFilter: (req, file, cb) => {
          if (file.mimetype === 'application/pdf') cb(null, true);
          else cb(new Error('Sadece PDF dosyası yüklenebilir'), false);
        },
        limits: { fileSize: 10 * 1024 * 1024 },
      },
    ),
  )
  registerUzman(
    @Body() dto: RegisterUzmanDto,
    @UploadedFiles() files: { certificate?: Express.Multer.File[]; cv?: Express.Multer.File[] },
  ) {
    return this.authService.registerUzman(dto, files);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: 'Giriş yap', description: 'Dakikada max 5 istek. Başarılı girişte accessToken (15dk) ve refreshToken (7gün) döner.' })
  @ApiResponse({ status: 200, schema: { example: { accessToken: 'eyJ...', refreshToken: 'eyJ...' } } })
  @ApiResponse({ status: 401, description: 'Geçersiz kimlik bilgileri' })
  @ApiResponse({ status: 429, description: 'Çok fazla istek (rate limit)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @ApiOperation({ summary: 'Token yenile', description: 'Süresi dolmamış refreshToken ile yeni accessToken alır. Eski refreshToken geçersiz olur (rotasyon).' })
  @ApiResponse({ status: 200, schema: { example: { accessToken: 'eyJ...', refreshToken: 'eyJ...' } } })
  refresh(@CurrentUser() user: { id: string; refreshToken: string }) {
    return this.authService.refresh(user.id, user.refreshToken);
  }

  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Çıkış yap', description: 'RefreshToken\'ı veritabanından siler.' })
  @ApiResponse({ status: 200, schema: { example: { message: 'Çıkış yapıldı' } } })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Giriş yapmış kullanıcıyı getir' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Profil güncelle (ad, soyad, telefon)' })
  updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateMeDto) {
    return this.authService.updateMe(user.id, dto);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Şifremi unuttum', description: 'Kayıtlı e-postaya 30 dakika geçerli sıfırlama linki gönderir.' })
  @ApiResponse({ status: 200, schema: { example: { message: 'Eğer e-posta kayıtlıysa sıfırlama bağlantısı gönderildi' } } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Şifre sıfırla', description: 'E-postadan gelen token ile şifreyi günceller.' })
  @ApiResponse({ status: 200, schema: { example: { message: 'Şifre başarıyla güncellendi' } } })
  @ApiResponse({ status: 400, description: 'Geçersiz veya süresi dolmuş token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
