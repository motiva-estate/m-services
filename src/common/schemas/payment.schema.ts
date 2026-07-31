import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  @Prop({ required: true })
  clientId: string;

  @Prop()
  subscriptionId?: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'NGN' })
  currency: string;

  // Reversal tracking
  @Prop({ default: false })
  reversed: boolean;

  @Prop()
  reversedAt?: Date;

  @Prop()
  reversedByUserId?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ clientId: 1 });
PaymentSchema.index({ subscriptionId: 1 });
PaymentSchema.index({ date: -1 });
