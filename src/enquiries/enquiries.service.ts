import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Enquiry, EnquiryDocument } from "../common/schemas/enquiry.schema";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PusherService } from "../pusher/pusher.service";

@Injectable()
export class EnquiriesService {
  constructor(
    @InjectModel(Enquiry.name) private model: Model<EnquiryDocument>,
    private audit: AuditLogService,
    private pusher: PusherService,
  ) {}

  async list(filters?: { status?: string; assignedToId?: string }, page = 1, limit = 20) {
    const q: Record<string, unknown> = {};
    if (filters?.status) q.status = filters.status;
    if (filters?.assignedToId) q.assignedToId = filters.assignedToId;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments(q),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string) {
    const e = await this.model.findById(id).lean().exec();
    if (!e) throw new NotFoundException("Enquiry not found");
    return e;
  }

  // Public-facing creation (from website contact form — no auth required)
  async createPublic(dto: {
    name: string;
    email: string;
    phone?: string;
    message: string;
    propertyId?: string;
  }) {
    const enquiry = await this.model.create({
      ...dto,
      email: dto.email.toLowerCase(),
      status: "NEW",
      createdAt: new Date(),
    });

    // Notify admin in realtime
    await this.pusher.enquiryEvent("enquiry.created", {
      id: enquiry._id.toString(),
      name: dto.name,
      email: dto.email,
    });

    return enquiry.toObject();
  }

  async update(id: string, dto: Partial<Enquiry>, actorId: string, actorName: string) {
    const before = await this.model.findById(id).lean().exec();
    if (!before) throw new NotFoundException("Enquiry not found");

    const updated = await this.model.findByIdAndUpdate(id, dto, { new: true }).lean().exec();

    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(dto)) {
      if ((before as any)[key] !== (dto as any)[key]) {
        changes[key] = (dto as any)[key];
      }
    }

    await this.audit.record({
      actorId,
      actorName,
      action: "enquiry.update",
      entityType: "Enquiry",
      entityId: id,
      changes,
    });
    await this.pusher.enquiryEvent("enquiry.updated", { id, changes });
    return updated;
  }

  async remove(id: string, actorId: string, actorName: string) {
    const e = await this.model.findByIdAndDelete(id).exec();
    if (!e) throw new NotFoundException("Enquiry not found");
    await this.audit.record({
      actorId,
      actorName,
      action: "enquiry.delete",
      entityType: "Enquiry",
      entityId: id,
    });
    await this.pusher.enquiryEvent("enquiry.deleted", { id });
    return { ok: true };
  }
}
