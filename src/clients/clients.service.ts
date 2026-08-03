import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Client, ClientDocument } from "../common/schemas/client.schema";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PusherService } from "../pusher/pusher.service";
import { CloudinaryService, UploadCategory } from "../cloudinary/cloudinary.service";

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private model: Model<ClientDocument>,
    private audit: AuditLogService,
    private pusher: PusherService,
    private cloudinary: CloudinaryService,
  ) {}

  async list(query?: { q?: string; status?: string }, page = 1, limit = 25) {
    const filter: Record<string, unknown> = {};
    if (query?.status) filter.status = query.status;
    if (query?.q) {
      filter.$or = [
        { fullName: { $regex: query.q, $options: "i" } },
        { email: { $regex: query.q, $options: "i" } },
        { phone: { $regex: query.q, $options: "i" } },
      ];
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string) {
    const c = await this.model.findById(id).lean().exec();
    if (!c) throw new NotFoundException("Client not found");
    return c;
  }

  async create(dto: Partial<Client>, actorId: string, actorName: string) {
    const client = await this.model.create({
      ...dto,
      email: dto.email?.toLowerCase(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.audit.record({
      actorId,
      actorName,
      action: "client.create",
      entityType: "Client",
      entityId: client._id.toString(),
      changes: dto as Record<string, unknown>,
    });
    await this.pusher.clientEvent("client.created", {
      id: client._id.toString(),
      fullName: client.fullName,
    });
    return client.toObject();
  }

  async update(id: string, dto: Partial<Client>, actorId: string, actorName: string) {
    const before = await this.model.findById(id).lean().exec();
    if (!before) throw new NotFoundException("Client not found");

    const updated = await this.model
      .findByIdAndUpdate(id, { ...dto, updatedAt: new Date() }, { new: true })
      .lean()
      .exec();

    // Compute changed fields for audit
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(dto)) {
      if (JSON.stringify((before as any)[key]) !== JSON.stringify((dto as any)[key])) {
        changes[key] = (dto as any)[key];
      }
    }
    await this.audit.record({
      actorId,
      actorName,
      action: "client.update",
      entityType: "Client",
      entityId: id,
      changes,
    });
    await this.pusher.clientEvent("client.updated", { id, changes });
    return updated;
  }

  async remove(id: string, actorId: string, actorName: string) {
    const c = await this.model.findByIdAndDelete(id).exec();
    if (!c) throw new NotFoundException("Client not found");
    await this.audit.record({
      actorId,
      actorName,
      action: "client.delete",
      entityType: "Client",
      entityId: id,
    });
    await this.pusher.clientEvent("client.deleted", { id });
    return { ok: true };
  }

  // ── KYC document upload ────────────────────────────────────────────────────
  async uploadKycDocument(
    clientId: string,
    field: "idDocumentUrl" | "utilityBillUrl" | "passportPhotoUrl",
    buffer: Buffer,
    originalName: string,
    actorId: string,
    actorName: string,
    mimetype?: string,
  ) {
    const client = await this.model.findById(clientId).lean().exec();
    if (!client) throw new NotFoundException("Client not found");

    const categoryMap: Record<string, UploadCategory> = {
      idDocumentUrl: "kyc_id",
      utilityBillUrl: "kyc_utility",
      passportPhotoUrl: "kyc_photo",
    };

    const result = await this.cloudinary.uploadBuffer(
      buffer,
      categoryMap[field],
      originalName,
      mimetype,
    );

    // Store the Cloudinary public_id as the URL field value
    const updated = await this.model
      .findByIdAndUpdate(
        clientId,
        { [field]: result.publicId, updatedAt: new Date() },
        { new: true },
      )
      .lean()
      .exec();

    await this.audit.record({
      actorId,
      actorName,
      action: `client.upload_kyc.${field}`,
      entityType: "Client",
      entityId: clientId,
      changes: { field, publicId: result.publicId },
    });
    await this.pusher.clientEvent("client.updated", { id: clientId });

    return { publicId: result.publicId, secureUrl: result.secureUrl, client: updated };
  }

  // ── Bulk import ────────────────────────────────────────────────────────────
  async bulkImport(rows: Array<Partial<Client>>, actorId: string, actorName: string) {
    const created = [];
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const client = await this.model.create({
          ...rows[i],
          email: rows[i].email?.toLowerCase(),
          source: "BULK_IMPORT",
          status: rows[i].status ?? "LEAD",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        created.push(client._id.toString());
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    await this.audit.record({
      actorId,
      actorName,
      action: "client.bulk_import",
      entityType: "Client",
      entityId: "bulk",
      changes: { imported: created.length, errors: errors.length },
    });

    return { imported: created.length, errors };
  }
}
