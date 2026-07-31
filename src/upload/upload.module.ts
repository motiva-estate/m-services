import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';

@Module({
  controllers: [UploadController],
  // CloudinaryService is provided globally via CloudinaryModule (@Global)
})
export class UploadModule {}
