import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EnquiryDocument = Enquiry & Document;
export type EnquiryStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';

@Schema({ timestamps: true, collection: 'enquiries' })
export class Enquiry {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop() phone?: string;

  @Prop({ required: true })
  message: string;

  @Prop() propertyId?: string;

  @Prop({
    type: String,
    enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'],
    default: 'NEW',
  })
  status: EnquiryStatus;

  @Prop() assignedToId?: string;

  // Notes from team
  @Prop() internalNotes?: string;
}

export const EnquirySchema = SchemaFactory.createForClass(Enquiry);
EnquirySchema.index({ status: 1 });
EnquirySchema.index({ createdAt: -1 });
