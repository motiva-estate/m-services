import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ClientDocument = Client & Document;

export type ClientStatus = 'LEAD' | 'ACTIVE' | 'LAPSED' | 'CONVERTED';
export type ClientSource = 'WEBSITE_FORM' | 'BULK_IMPORT' | 'MANUAL' | 'REFERRAL';

@Schema({ _id: false })
class NextOfKin {
  @Prop() firstName?: string;
  @Prop() lastName?: string;
  @Prop() phone?: string;
  @Prop() address?: string;
}

@Schema({ _id: false })
class NotificationPrefs {
  @Prop({ default: true }) email: boolean;
  @Prop({ default: false }) whatsapp: boolean;
}

@Schema({ timestamps: true, collection: 'clients' })
export class Client {
  @Prop({ required: true })
  fullName: string;

  @Prop() firstName?: string;
  @Prop() lastName?: string;

  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop() phone?: string;
  @Prop() contactAddress?: string;

  @Prop({
    type: String,
    enum: ['WEBSITE_FORM', 'BULK_IMPORT', 'MANUAL', 'REFERRAL'],
    default: 'MANUAL',
  })
  source: ClientSource;

  @Prop({
    type: String,
    enum: ['LEAD', 'ACTIVE', 'LAPSED', 'CONVERTED'],
    default: 'LEAD',
  })
  status: ClientStatus;

  @Prop() assignedProjectId?: string;

  @Prop({ type: [String], default: [] })
  subscribedProjectIds: string[];

  @Prop({ type: NextOfKin })
  nextOfKin?: NextOfKin;

  @Prop({ default: false })
  termsAccepted: boolean;

  @Prop() signatureName?: string;
  @Prop() signatureDate?: string;

  // Cloudinary public IDs — resolved to signed URLs on GET
  @Prop() idDocumentUrl?: string;
  @Prop() utilityBillUrl?: string;
  @Prop() passportPhotoUrl?: string;

  @Prop() notes?: string;

  // Portal
  @Prop() contactConfirmedAt?: Date;

  @Prop({ type: NotificationPrefs })
  notificationPrefs?: NotificationPrefs;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
// Index for search
ClientSchema.index({ email: 1 });
ClientSchema.index({ fullName: 'text', email: 'text', phone: 'text' });
