"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));
    app.useStaticAssets((0, path_1.join)(__dirname, '..', 'uploads'), { prefix: '/uploads' });
    app.enableCors({
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    });
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Psiko Danışmanlık API')
        .setDescription('Psiko danışmanlık platformu backend API dokümantasyonu.\n\n' +
        '**Auth:** Login endpoint\'inden aldığın `accessToken` değerini sağ üstteki "Authorize" butonuna gir.')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
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
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
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
//# sourceMappingURL=main.js.map