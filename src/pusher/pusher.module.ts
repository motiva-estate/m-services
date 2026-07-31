import { Module, Global } from '@nestjs/common';
import { PusherService } from './pusher.service';
import { PusherController } from './pusher.controller';

@Global()
@Module({
  providers: [PusherService],
  controllers: [PusherController],
  exports: [PusherService],
})
export class PusherModule {}
