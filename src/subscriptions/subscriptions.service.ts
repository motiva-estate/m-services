import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Subscription, SubscriptionDocument } from "../common/schemas/subscription.schema";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PusherService } from "../pusher/pusher.service";

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name) private model: Model<SubscriptionDocument>,
    private audit: AuditLogService,
    private pusher: PusherService,
  ) {}

  async list(
    filters?: { clientId?: string; status?: string; projectRef?: string },
    page = 1,
    limit = 20,
  ) {
    const q: Record<string, unknown> = {};
    if (filters?.clientId) q.clientId = filters.clientId;
    if (filters?.status) q.status = filters.status;
    if (filters?.projectRef) q.projectRef = filters.projectRef;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.model.countDocuments(q),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string) {
    const s = await this.model.findById(id).lean().exec();
    if (!s) throw new NotFoundException("Subscription not found");
    return s;
  }

  async create(dto: Partial<Subscription>, actorId: string, actorName: string) {
    const sub = await this.model.create({
      ...dto,
      amountPaid: dto.amountPaid ?? 0,
      createdAt: new Date(),
    });
    await this.audit.record({
      actorId,
      actorName,
      action: "subscription.create",
      entityType: "Subscription",
      entityId: sub._id.toString(),
      changes: dto as Record<string, unknown>,
    });
    await this.pusher.subscriptionEvent("subscription.created", {
      id: sub._id.toString(),
      clientId: sub.clientId,
      plan: sub.plan,
    });
    return sub.toObject();
  }

  async update(id: string, dto: Partial<Subscription>, actorId: string, actorName: string) {
    const before = await this.model.findById(id).lean().exec();
    if (!before) throw new NotFoundException("Subscription not found");

    const updated = await this.model.findByIdAndUpdate(id, dto, { new: true }).lean().exec();
    await this.audit.record({
      actorId,
      actorName,
      action: "subscription.update",
      entityType: "Subscription",
      entityId: id,
      changes: dto as Record<string, unknown>,
    });
    await this.pusher.subscriptionEvent("subscription.updated", { id, changes: dto });
    // Notify subscriber portal
    if (before.clientId) {
      await this.pusher.portalEvent(before.clientId, "subscription.updated", { id });
    }
    return updated;
  }

  async remove(id: string, actorId: string, actorName: string) {
    const s = await this.model.findByIdAndDelete(id).exec();
    if (!s) throw new NotFoundException("Subscription not found");
    await this.audit.record({
      actorId,
      actorName,
      action: "subscription.delete",
      entityType: "Subscription",
      entityId: id,
    });
    await this.pusher.subscriptionEvent("subscription.deleted", { id });
    return { ok: true };
  }

  // Called by PaymentsService after recording a payment to advance nextDueDate
  async advanceNextDue(subscriptionId: string, amountPaid: number) {
    const sub = await this.model.findById(subscriptionId).exec();
    if (!sub) return;

    sub.amountPaid = (sub.amountPaid ?? 0) + amountPaid;

    if (sub.installments?.length) {
      const sorted = [...sub.installments].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
      let running = 0;
      const next = sorted.find((r) => {
        running += r.amount;
        return running > sub.amountPaid;
      });
      sub.nextDueDate = next?.dueDate;
    }

    await sub.save();
    return sub.toObject();
  }

  async reversePayment(subscriptionId: string, amount: number) {
    const sub = await this.model.findById(subscriptionId).exec();
    if (!sub) return;
    sub.amountPaid = Math.max(0, (sub.amountPaid ?? 0) - amount);
    if (sub.installments?.length) {
      const sorted = [...sub.installments].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
      let running = 0;
      const next = sorted.find((r) => {
        running += r.amount;
        return running > sub.amountPaid;
      });
      sub.nextDueDate = next?.dueDate;
    }
    await sub.save();
    return sub.toObject();
  }
}
