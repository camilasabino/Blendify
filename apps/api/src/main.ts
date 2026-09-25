import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './presentation/filters/global-exception.filter';
import { createBodyParser } from './presentation/http/body-limits';
import {
  CLIENT_IP_DIAGNOSTICS,
  createClientIpDiagnostics,
  parseClientIpDiagnostics,
} from './presentation/request-limits/client-ip-diagnostics';
import { parseTrustProxy } from './presentation/request-limits/request-limits.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);

  app.set('trust proxy', parseTrustProxy(config.get<string>('TRUST_PROXY')));
  if (parseClientIpDiagnostics(config.get<string>(CLIENT_IP_DIAGNOSTICS))) {
    app.use(createClientIpDiagnostics());
  }
  app.use(createBodyParser());
  app.use(cookieParser());
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  if (config.get<string>('NODE_ENV') !== 'production') {
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
  }

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
