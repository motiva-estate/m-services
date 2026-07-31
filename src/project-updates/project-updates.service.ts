import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ProjectUpdate, ProjectUpdateDocument } from "../common/schemas/project-update.schema";
import { Subscription, SubscriptionDocument } from "../common/schemas/subscription.schema";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PusherService } from "../pusher/pusher.service";

@Injectable()
export class ProjectUpdatesService {
  constructor(
    @InjectModel(ProjectUpdate.name) private model: Model<ProjectUpdateDocument>,
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    private cloudinary: CloudinaryService,
    private audit: AuditLogService,
    private pusher: PusherService,
  ) {}

  async list(filters?: { projectRef?: string }, page = 1, limit = 20) {
    const q: Record<string, unknown> = {};
    if (filters?.projectRef) q.projectRef = filters.projectRef;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(q).sort({ postedAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments(q),
    ]);
    return { data: this.enrichPhotos(data), total, page, limit };
  }

  async listForProject(projectRef: string) {
    const updates = await this.model.find({ projectRef }).sort({ postedAt: -1 }).lean().exec();
    return this.enrichPhotos(updates);
  }

  // Portal — list updates for all project refs a client is subscribed to
  async listForClient(clientId: string) {
    const subs = await this.subModel
      .find({ clientId, projectRef: { $exists: true } })
      .lean()
      .exec();
    const refs = [...new Set(subs.map((s) => (s as any).projectRef).filter(Boolean))];
    const updates = await this.model
      .find({ projectRef: { $in: refs } })
      .sort({ postedAt: -1 })
      .lean()
      .exec();
    return this.enrichPhotos(updates);
  }

  async get(id: string) {
    const u = await this.model.findById(id).lean().exec();
    if (!u) throw new NotFoundException("Project update not found");
    return this.enrichPhotos([u])[0];
  }

  // Create a text-only update (photos uploaded separately via uploadPhoto)
  async create(
    dto: { projectRef: string; projectRefType: "project" | "land"; text: string },
    actorId: string,
    actorName: string,
  ) {
    const update = await this.model.create({
      ...dto,
      photos: [],
      postedAt: new Date().toISOString(),
      postedByUserId: actorId,
    });

    await this.audit.record({
      actorId,
      actorName,
      action: "update.create",
      entityType: "ProjectUpdate",
      entityId: update._id.toString(),
      changes: dto as Record<string, unknown>,
    });

    await this.pusher.updateEvent(dto.projectRef, "update.posted", {
      id: update._id.toString(),
      projectRef: dto.projectRef,
      text: dto.text,
    });

    return this.enrichPhotos([update.toObject()])[0];
  }

  // Upload a photo and attach it to an existing update
  async uploadPhoto(
    updateId: string,
    buffer: Buffer,
    originalName: string,
    caption: string | undefined,
    actorId: string,
    actorName: string,
  ) {
    const update = await this.model.findById(updateId).exec();
    if (!update) throw new NotFoundException("Project update not found");

    const result = await this.cloudinary.uploadBuffer(buffer, "update_photo", originalName);

    update.photos.push({
      cloudinaryPublicId: result.publicId,
      caption,
      cachedUrl: result.secureUrl,
    } as any);

    await update.save();

    await this.audit.record({
      actorId,
      actorName,
      action: "update.upload_photo",
      entityType: "ProjectUpdate",
      entityId: updateId,
      changes: { publicId: result.publicId },
    });

    await this.pusher.updateEvent(update.projectRef, "update.photo_added", {
      updateId,
      photoUrl: result.secureUrl,
    });

    return { publicId: result.publicId, secureUrl: result.secureUrl };
  }

  // Create update with photos in one call (text + photo buffers array)
  async createWithPhotos(
    dto: { projectRef: string; projectRefType: "project" | "land"; text: string },
    photoFiles: { buffer: Buffer; originalName: string; caption?: string }[],
    actorId: string,
    actorName: string,
  ) {
    // Upload all photos concurrently
    const photoResults = await Promise.all(
      photoFiles.map((f) => this.cloudinary.uploadBuffer(f.buffer, "update_photo", f.originalName)),
    );

    const update = await this.model.create({
      ...dto,
      photos: photoResults.map((r, i) => ({
        cloudinaryPublicId: r.publicId,
        caption: photoFiles[i].caption,
        cachedUrl: r.secureUrl,
      })),
      postedAt: new Date().toISOString(),
      postedByUserId: actorId,
    });

    await this.audit.record({
      actorId,
      actorName,
      action: "update.create",
      entityType: "ProjectUpdate",
      entityId: update._id.toString(),
      changes: { ...dto, photoCount: photoResults.length } as Record<string, unknown>,
    });

    await this.pusher.updateEvent(dto.projectRef, "update.posted", {
      id: update._id.toString(),
      projectRef: dto.projectRef,
    });

    return this.enrichPhotos([update.toObject()])[0];
  }

  async remove(id: string, actorId: string, actorName: string) {
    const update = await this.model.findById(id).exec();
    if (!update) throw new NotFoundException("Project update not found");

    // Delete all photos from Cloudinary
    await Promise.allSettled(
      update.photos.map((p: any) => this.cloudinary.deleteFile(p.cloudinaryPublicId, "image")),
    );

    await update.deleteOne();

    await this.audit.record({
      actorId,
      actorName,
      action: "update.delete",
      entityType: "ProjectUpdate",
      entityId: id,
    });
    await this.pusher.updateEvent(update.projectRef, "update.deleted", { id });

    return { ok: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private enrichPhotos(updates: any[]) {
    return updates.map((u) => ({
      ...u,
      // Flatten photos to URL array (as the frontend expects)
      photos: (u.photos ?? []).map(
        (p: any) => p.cachedUrl ?? this.cloudinary.imageUrl(p.cloudinaryPublicId, { width: 1200 }),
      ),
    }));
  }
}
