import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../common/schemas/client.schema';
import { Subscription, SubscriptionSchema } from '../common/schemas/subscription.schema';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    AuditLogModule,
  ],
  providers: [PortalService],
  controllers: [PortalController],
})
export class PortalModule {}
