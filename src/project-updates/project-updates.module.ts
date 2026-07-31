import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectUpdate, ProjectUpdateSchema } from '../common/schemas/project-update.schema';
import { Subscription, SubscriptionSchema } from '../common/schemas/subscription.schema';
import { ProjectUpdatesService } from './project-updates.service';
import { ProjectUpdatesController } from './project-updates.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectUpdate.name, schema: ProjectUpdateSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    AuditLogModule,
  ],
  providers: [ProjectUpdatesService],
  controllers: [ProjectUpdatesController],
  exports: [ProjectUpdatesService],
})
export class ProjectUpdatesModule {}
