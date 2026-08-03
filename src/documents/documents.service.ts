import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  SubscriberDocument,
  SubscriberDocumentDoc,
  DocumentCategory,
} from "../common/schemas/document.schema";
import { Subscription, SubscriptionDocument } from "../common/schemas/subscription.schema";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PusherService } from "../pusher/pusher.service";

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(SubscriberDocument.name) private model: Model<SubscriberDocumentDoc>,
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    private cloudinary: CloudinaryService,
    private audit: AuditLogService,
    private pusher: PusherService,
  ) {}

  async list(filters?: { subscriptionId?: string }, page = 1, limit = 20) {
    const q: Record<string, unknown> = {};
    if (filters?.subscriptionId) q.subscriptionId = filters.subscriptionId;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(q).sort({ uploadedAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments(q),
    ]);
    const enriched = this.enrichWithUrls(data);
    return { data: enriched, total, page, limit };
  }

  // ── Admin: list documents for a subscription ──────────────────────────────
  async listForSubscription(subscriptionId: string) {
    const docs = await this.model.find({ subscriptionId }).sort({ uploadedAt: -1 }).lean().exec();
    return this.enrichWithUrls(docs);
  }

  // ── Admin: list documents for all subscriptions of a client ───────────────
  async listForClient(clientId: string) {
    const subs = await this.subModel.find({ clientId }).lean().exec();
    const subIds = subs.map((s) => s._id.toString());
    const docs = await this.model
      .find({ subscriptionId: { $in: subIds } })
      .sort({ uploadedAt: -1 })
      .lean()
      .exec();
    return this.enrichWithUrls(docs);
  }

  // ── Admin: upload a document (multipart) ─────────────────────────────────
  async upload(
    subscriptionId: string,
    label: string,
    visibility: string,
    category: DocumentCategory,
    buffer: Buffer,
    originalName: string,
    actorId: string,
    actorName: string,
    mimetype?: string,
  ) {
    // Validate subscription exists
    const sub = await this.subModel.findById(subscriptionId).lean().exec();
    if (!sub) throw new NotFoundException("Subscription not found");

    const result = await this.cloudinary.uploadBuffer(buffer, category, originalName, mimetype);

    const doc = await this.model.create({
      subscriptionId,
      cloudinaryPublicId: result.publicId,
      label,
      originalFilename: originalName,
      format: result.format,
      resourceType: result.resourceType,
      category,
      visibility,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: actorId,
      cachedUrl: result.secureUrl,
    });

    await this.audit.record({
      actorId,
      actorName,
      action: "document.upload",
      entityType: "Document",
      entityId: doc._id.toString(),
      changes: { subscriptionId, label, category, visibility },
    });

    // Notify admin + subscriber portal
    await this.pusher.documentEvent((sub as any).clientId, "document.uploaded", {
      id: doc._id.toString(),
      subscriptionId,
      label,
    });

    return { ...doc.toObject(), secureUrl: result.secureUrl };
  }

  // ── Admin: delete a document ──────────────────────────────────────────────
  async remove(id: string, actorId: string, actorName: string) {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException("Document not found");

    await this.cloudinary.deleteFile(doc.cloudinaryPublicId, doc.resourceType as any);

    await doc.deleteOne();

    await this.audit.record({
      actorId,
      actorName,
      action: "document.delete",
      entityType: "Document",
      entityId: id,
    });
    await this.pusher.trigger("private-admin", "document.deleted", { id });

    return { ok: true };
  }

  // ── Portal: get documents for a subscriber (visibility-filtered) ──────────
  async listForPortal(clientId: string): Promise<any[]> {
    const subs = await this.subModel.find({ clientId }).lean().exec();
    const subIds = subs.map((s) => ({ id: s._id.toString(), sub: s }));
    const allDocs = await this.model
      .find({ subscriptionId: { $in: subIds.map((s) => s.id) } })
      .sort({ uploadedAt: -1 })
      .lean()
      .exec();

    return allDocs.map((doc) => {
      const subEntry = subIds.find((s) => s.id === doc.subscriptionId);
      const sub = subEntry?.sub as any;
      const visible = this.isVisible(doc, sub);
      const url = visible ? this.resolveUrl(doc) : null;
      return { ...doc, visible, url };
    });
  }

  // ── Portal: get signed download URL for a specific document ──────────────
  async getDownloadUrl(docId: string, clientId: string) {
    const doc = await this.model.findById(docId).lean().exec();
    if (!doc) throw new NotFoundException("Document not found");

    const sub = await this.subModel.findById(doc.subscriptionId).lean().exec();
    if (!sub || (sub as any).clientId !== clientId) {
      throw new ForbiddenException("Not authorised");
    }

    if (!this.isVisible(doc, sub)) {
      throw new ForbiddenException("Document not yet unlocked");
    }

    // Generate a 1-hour signed URL
    const url = this.cloudinary.generateSignedUrl(
      doc.cloudinaryPublicId,
      doc.resourceType as any,
      3600,
    );

    return { url, expiresIn: 3600 };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private isVisible(doc: any, sub: any): boolean {
    if (!sub) return false;
    if (doc.visibility === "immediate") return true;
    if (doc.visibility === "on_full_payment") {
      const total = sub.totalPrice ?? sub.amount ?? 0;
      return total > 0 && (sub.amountPaid ?? 0) >= total;
    }
    // on_milestone:xxx — admin must manually unlock (treated as locked until toggled)
    return false;
  }

  private resolveUrl(doc: any): string {
    return this.cloudinary.secureUrl(doc.cloudinaryPublicId, doc.resourceType as any);
  }

  private enrichWithUrls(docs: any[]) {
    return docs.map((d) => ({
      ...d,
      fileUrl: this.cloudinary.secureUrl(d.cloudinaryPublicId, d.resourceType),
    }));
  }
}
