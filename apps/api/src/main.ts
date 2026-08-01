import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './presentation/filters/global-exception.filter';

async function bootstrap() {
  // Disable default body parser so we can raise the limit for playlist covers
  // (JPEG base64 can be ~250–350 KB; Express default is 100 KB).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser(config.get<string>('COOKIE_SECRET')));
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173',
    credentials: true,
  });
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle('Blendify API')
    .setDescription('Build Spotify playlists from your favorite artists')
    .setVersion('1.0')
    .addCookieAuth('blendify_session')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swagger),
  );

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
