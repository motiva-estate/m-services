import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;
export type SubscriptionStatus = 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'CANCELLED';

@Schema({ _id: false })
class Installment {
  @Prop({ required: true }) index: number;
  @Prop() label?: string;
  @Prop({ required: true }) dueDate: string;
  @Prop({ required: true }) amount: number;
}

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription {
  @Prop({ required: true })
  clientId: string;

  @Prop({ required: true })
  plan: string;

  @Prop({
    type: String,
    enum: ['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
  })
  status: SubscriptionStatus;

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'NGN' })
  currency: string;

  @Prop()
  paymentReference?: string;

  @Prop({ default: false })
  autoRenew: boolean;

  // Project linkage
  @Prop() projectRef?: string;
  @Prop({ type: String, enum: ['project', 'land'] })
  projectRefType?: 'project' | 'land';

  @Prop() totalPrice?: number;
  @Prop({ default: 0 }) amountPaid: number;
  @Prop() paymentPlan?: string;
  @Prop() nextDueDate?: string;

  @Prop({ type: [Installment], default: [] })
  installments: Installment[];
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
SubscriptionSchema.index({ clientId: 1 });
SubscriptionSchema.index({ projectRef: 1 });
SubscriptionSchema.index({ status: 1 });
