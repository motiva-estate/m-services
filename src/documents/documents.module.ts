import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriberDocument, SubscriberDocumentSchema } from '../common/schemas/document.schema';
import { Subscription, SubscriptionSchema } from '../common/schemas/subscription.schema';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SubscriberDocument.name, schema: SubscriberDocumentSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    AuditLogModule,
  ],
  providers: [DocumentsService],
  controllers: [DocumentsController],
  exports: [DocumentsService],
})
export class DocumentsModule {}
