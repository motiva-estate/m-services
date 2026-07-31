import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AuditLog, AuditLogDocument } from "../common/schemas/audit-log.schema";

export interface AuditEntry {
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  constructor(@InjectModel(AuditLog.name) private model: Model<AuditLogDocument>) {}

  async record(entry: AuditEntry): Promise<AuditLogDocument> {
    return this.model.create({
      ...entry,
      createdAt: new Date(),
    });
  }

  async list(
    filters: { entityType?: string; entityId?: string; actorId?: string } = {},
    page = 1,
    limit = 30,
  ) {
    const query: Record<string, unknown> = {};
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.entityId) query.entityId = filters.entityId;
    if (filters.actorId) query.actorId = filters.actorId;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments(query),
    ]);
    return { data, total, page, limit };
  }

  async listRecent(limit = 20) {
    return this.model.find().sort({ createdAt: -1 }).limit(limit).lean().exec();
  }
}
