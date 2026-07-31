import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ThrottlerModule } from "@nestjs/throttler";

import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ClientsModule } from "./clients/clients.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { PaymentsModule } from "./payments/payments.module";
import { EnquiriesModule } from "./enquiries/enquiries.module";
import { DocumentsModule } from "./documents/documents.module";
import { ProjectUpdatesModule } from "./project-updates/project-updates.module";
import { AuditLogModule } from "./audit-log/audit-log.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { CloudinaryModule } from "./cloudinary/cloudinary.module";
import { PusherModule } from "./pusher/pusher.module";
import { PortalModule } from "./portal/portal.module";
import { UploadModule } from "./upload/upload.module";

@Module({
  imports: [
    // Config — loads .env
    ConfigModule.forRoot({ isGlobal: true }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>("MONGODB_URI", "mongodb://localhost:27017/motiva"),
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),

    // Feature modules
    CloudinaryModule,
    PusherModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    SubscriptionsModule,
    PaymentsModule,
    EnquiriesModule,
    DocumentsModule,
    ProjectUpdatesModule,
    AuditLogModule,
    DashboardModule,
    PortalModule,
    UploadModule,
  ],
})
export class AppModule {}
