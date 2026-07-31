import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDocument } from 'mongoose';

export type SubscriberDocumentDoc = SubscriberDocument & MongoDocument;

// Visibility rule — controls when subscriber can see/download the file
export type DocumentVisibility =
  | 'immediate'
  | 'on_full_payment'
  | `on_milestone:${string}`;

// Category used for Cloudinary folder routing
export type DocumentCategory =
  | 'receipt'
  | 'offer_letter'
  | 'title_deed'
  | 'allocation'
  | 'survey'
  | 'kyc_id'
  | 'kyc_utility'
  | 'kyc_photo'
  | 'update_photo'
  | 'other';

@Schema({ timestamps: true, collection: 'subscriber_documents' })
export class SubscriberDocument {
  @Prop({ required: true })
  subscriptionId: string;

  // Stored as Cloudinary public_id so we can generate signed URLs
  @Prop({ required: true })
  cloudinaryPublicId: string;

  // Human-readable label
  @Prop({ required: true })
  label: string;

  // Original filename
  @Prop()
  originalFilename?: string;

  // File format returned by Cloudinary (pdf, jpg, png, mp4…)
  @Prop()
  format?: string;

  // Resource type: image | video | raw (for PDFs and other files)
  @Prop({ default: 'raw' })
  resourceType: string;

  // Category drives Cloudinary folder
  @Prop({
    type: String,
    enum: ['receipt', 'offer_letter', 'title_deed', 'allocation', 'survey',
           'kyc_id', 'kyc_utility', 'kyc_photo', 'update_photo', 'other'],
    default: 'other',
  })
  category: DocumentCategory;

  @Prop({ required: true, default: 'immediate' })
  visibility: string; // DocumentVisibility

  @Prop({ required: true })
  uploadedAt: string;

  @Prop()
  uploadedByUserId?: string;

  // Cached Cloudinary secure_url (refreshed on GET)
  @Prop()
  cachedUrl?: string;
}

export const SubscriberDocumentSchema = SchemaFactory.createForClass(SubscriberDocument);
SubscriberDocumentSchema.index({ subscriptionId: 1 });
SubscriberDocumentSchema.index({ category: 1 });
