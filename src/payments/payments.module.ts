import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from '../common/schemas/payment.schema';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    AuditLogModule,
    SubscriptionsModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
