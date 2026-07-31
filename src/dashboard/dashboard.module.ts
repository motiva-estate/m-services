import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../common/schemas/client.schema';
import { Subscription, SubscriptionSchema } from '../common/schemas/subscription.schema';
import { Enquiry, EnquirySchema } from '../common/schemas/enquiry.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Enquiry.name, schema: EnquirySchema },
    ]),
    AuditLogModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
