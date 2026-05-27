import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

let cachedApp: NestExpressApplication;

async function createApp(): Promise<NestExpressApplication> {
  if (cachedApp) return cachedApp;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
      : []),
  ];

  app.enableCors({
    origin: (origin, callback) => {
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

  // Swagger — production'da devre dışı bırakabilirsin
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Psiko Danışmanlık API')
      .setDescription(
        'Psiko danışmanlık platformu backend API dokümantasyonu.\n\n' +
          "**Auth:** Login endpoint'inden aldığın `accessToken` değerini sağ üstteki \"Authorize\" butonuna gir.",
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
  }

  await app.init();
  cachedApp = app;
  return app;
}

// Vercel serverless handler
export default async function handler(req: any, res: any) {
  const app = await createApp();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(req, res);
}

// Local development
if (process.env.NODE_ENV !== 'production' && require.main === module) {
  createApp().then(async (app) => {
    const port = process.env.PORT || 4000;
    await app.listen(port);
    console.log(`Uygulama http://localhost:${port} adresinde çalışıyor`);
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  });
}
