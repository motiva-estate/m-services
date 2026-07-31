import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import * as cookieParser from "cookie-parser";
import helmet from "helmet";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const isProd = process.env.NODE_ENV === "production";

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(
    helmet({
      // Relax CSP in dev so the Swagger UI can load its inline scripts/styles.
      contentSecurityPolicy: isProd ? undefined : false,
    }),
  );
  app.use(cookieParser());

  // ── Health check ───────────────────────────────────────────────────────────
  // Registered BEFORE setGlobalPrefix so the path is exactly GET /api/health.
  // Render's health probe hits this endpoint before routing traffic.
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get("/api/health", (_req: any, res: any) => {
    res.status(200).json({
      status: "ok",
      environment: process.env.NODE_ENV ?? "development",
      timestamp: new Date().toISOString(),
    });
  });

  // ── Global route prefix ────────────────────────────────────────────────────
  app.setGlobalPrefix("api");

  // ── CORS ───────────────────────────────────────────────────────────────────
  // FRONTEND_URL is a single origin in production (e.g. https://admin.motivaestate.com).
  // In development it falls back to localhost.
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // ── Global validation ──────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Swagger / OpenAPI ──────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle("Motiva Admin API")
    .setDescription(
      "REST API for the Motiva Estate admin panel and subscriber portal.\n\n" +
        "**Authentication**: All protected routes require a Bearer JWT obtained from `POST /auth/login`. " +
        "Click **Authorize** and paste the `accessToken` value.\n\n" +
        "**Refresh tokens** are stored in an HttpOnly cookie and rotated automatically by the client SDK.",
    )
    .setVersion("1.0")
    .setContact("Motiva Estate", "https://motivaestate.com", "hello@motivaestate.com")
    .setLicense("Proprietary", "")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT", in: "header" },
      "access-token",
    )
    .addTag("Auth", "Login, token refresh, 2FA and password management")
    .addTag("Portal", "Subscriber self-service — profile & own subscriptions (role: SUBSCRIBER)")
    .addTag("Clients", "CRM client records — requires clients.manage capability")
    .addTag("Subscriptions", "Subscription management — requires subscriptions.manage capability")
    .addTag("Payments", "Payment recording and reversal — requires subscriptions.manage capability")
    .addTag("Documents", "Subscription documents — upload, download and portal delivery")
    .addTag("Project Updates", "Project progress posts visible on the subscriber portal")
    .addTag("Enquiries", "Website contact-form enquiries and pipeline management")
    .addTag("Users", "Admin user accounts and role management — requires users.manage capability")
    .addTag("Audit Log", "Immutable action log — requires audit.view capability")
    .addTag("Dashboard", "Aggregate stats for the admin overview")
    .addTag("Pusher", "Pusher private-channel authentication endpoint")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
      docExpansion: "none",
      filter: true,
      tryItOutEnabled: true,
    },
    customSiteTitle: "Motiva API Docs",
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  // Render injects PORT at runtime; default to 4000 locally.
  const port = parseInt(process.env.PORT ?? "4000", 10);
  await app.listen(port, "0.0.0.0"); // bind 0.0.0.0 so Render can reach it
  console.log(`Motiva API  → http://0.0.0.0:${port}/api`);
  console.log(`Swagger     → http://0.0.0.0:${port}/api/docs`);
  console.log(`Health      → http://0.0.0.0:${port}/api/health`);
}

bootstrap();
