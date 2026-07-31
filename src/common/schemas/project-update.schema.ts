import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProjectUpdateDocument = ProjectUpdate & Document;

@Schema({ _id: false })
class UpdatePhoto {
  @Prop({ required: true }) cloudinaryPublicId: string;
  @Prop() caption?: string;
  // Cached secure_url
  @Prop() cachedUrl?: string;
}

@Schema({ timestamps: true, collection: 'project_updates' })
export class ProjectUpdate {
  @Prop({ required: true })
  projectRef: string;

  @Prop({ type: String, enum: ['project', 'land'], required: true })
  projectRefType: 'project' | 'land';

  @Prop({ required: true })
  text: string;

  @Prop({ type: [UpdatePhoto], default: [] })
  photos: UpdatePhoto[];

  @Prop({ required: true })
  postedAt: string;

  @Prop()
  postedByUserId?: string;
}

export const ProjectUpdateSchema = SchemaFactory.createForClass(ProjectUpdate);
ProjectUpdateSchema.index({ projectRef: 1, postedAt: -1 });
