import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { Receipt, ReceiptSchema } from '../common/schemas/receipt.schema';
import { Client, ClientSchema } from '../common/schemas/client.schema';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Receipt.name, schema: ReceiptSchema },
      { name: Client.name, schema: ClientSchema },
    ]),
    CloudinaryModule,
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, PdfGeneratorService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
