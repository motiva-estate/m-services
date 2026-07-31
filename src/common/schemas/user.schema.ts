import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export type Role = 'SUPER_ADMIN' | 'ADMINISTRATOR' | 'CONTENT_EDITOR' | 'VIEWER' | 'SUBSCRIBER';

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true })
  fullName: string;

  @Prop({ required: false })
  firstName?: string;

  @Prop({ required: false })
  lastName?: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({
    type: String,
    enum: ['SUPER_ADMIN', 'ADMINISTRATOR', 'CONTENT_EDITOR', 'VIEWER', 'SUBSCRIBER'],
    default: 'VIEWER',
  })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  twoFAEnabled: boolean;

  @Prop()
  twoFASecret?: string;

  @Prop()
  lastLoginAt?: Date;

  // For SUBSCRIBER role — links to Client record
  @Prop()
  clientId?: string;

  // Refresh token hash stored server-side (HttpOnly cookie pattern)
  @Prop({ select: false })
  refreshTokenHash?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
