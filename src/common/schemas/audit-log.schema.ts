import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ required: true })
  actorId: string;

  @Prop({ required: true })
  actorName: string;

  @Prop({ required: true })
  action: string; // e.g. 'client.create', 'payment.record', 'subscription.update'

  @Prop({ required: true })
  entityType: string;

  @Prop({ required: true })
  entityId: string;

  @Prop({ type: Object })
  changes?: Record<string, unknown>;

  @Prop() ipAddress?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ actorId: 1 });
AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ createdAt: -1 });
