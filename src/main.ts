import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(o => o.trim()) : []),
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // sunucu-sunucu istekleri (origin yok) ve izin listesindekiler geçer
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: ${origin} izin listesinde yok`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Psiko Danışmanlık API')
    .setDescription(
      'Psiko danışmanlık platformu backend API dokümantasyonu.\n\n' +
      '**Auth:** Login endpoint\'inden aldığın `accessToken` değerini sağ üstteki "Authorize" butonuna gir.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('auth', 'Kimlik doğrulama & kayıt işlemleri')
    .addTag('experts', 'Uzman profilleri & müsaitlik yönetimi')
    .addTag('forum', 'Uzman Cevaplıyor - soru & cevap modülü')
    .addTag('comments', 'Uzman yorumları')
    .addTag('requests', 'Danışan talep formları')
    .addTag('tests', 'Psikolojik testler & sonuçlar')
    .addTag('blogs', 'Uzman blog yazıları')
    .addTag('sss', 'Sıkça Sorulan Sorular')
    .addTag('contact', 'İletişim formu')
    .addTag('newsletter', 'Bülten aboneliği')
    .addTag('notifications', 'Bildirimler (SSE)')
    .addTag('admin', 'Admin panel yönetimi')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Uygulama http://localhost:${port} adresinde çalışıyor`);
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
}
bootstrap();
