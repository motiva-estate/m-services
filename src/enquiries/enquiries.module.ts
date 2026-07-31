import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Enquiry, EnquirySchema } from '../common/schemas/enquiry.schema';
import { EnquiriesService } from './enquiries.service';
import { EnquiriesController } from './enquiries.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Enquiry.name, schema: EnquirySchema }]),
    AuditLogModule,
  ],
  providers: [EnquiriesService],
  controllers: [EnquiriesController],
  exports: [EnquiriesService],
})
export class EnquiriesModule {}
