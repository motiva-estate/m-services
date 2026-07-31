import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Payment, PaymentDocument } from "../common/schemas/payment.schema";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PusherService } from "../pusher/pusher.service";

export interface RecordPaymentDto {
  clientId: string;
  subscriptionId: string;
  date: string;
  label: string;
  amount: number;
  currency?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private model: Model<PaymentDocument>,
    private subscriptions: SubscriptionsService,
    private audit: AuditLogService,
    private pusher: PusherService,
  ) {}

  async list(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model
        .find({ reversed: { $ne: true } })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments({ reversed: { $ne: true } }),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string) {
    const p = await this.model.findById(id).lean().exec();
    if (!p) throw new NotFoundException("Payment not found");
    return p;
  }

  async byClient(clientId: string) {
    return this.model
      .find({ clientId, reversed: { $ne: true } })
      .sort({ date: -1 })
      .lean()
      .exec();
  }

  async bySubscription(subscriptionId: string) {
    return this.model
      .find({ subscriptionId, reversed: { $ne: true } })
      .sort({ date: -1 })
      .lean()
      .exec();
  }

  async record(dto: RecordPaymentDto, actorId: string, actorName: string) {
    if (dto.amount <= 0) throw new BadRequestException("Amount must be positive");

    const payment = await this.model.create({
      ...dto,
      currency: dto.currency ?? "NGN",
      reversed: false,
      createdAt: new Date(),
    });

    // Advance subscription amountPaid + nextDueDate
    await this.subscriptions.advanceNextDue(dto.subscriptionId, dto.amount);

    await this.audit.record({
      actorId,
      actorName,
      action: "payment.record",
      entityType: "Payment",
      entityId: payment._id.toString(),
      changes: { clientId: dto.clientId, subscriptionId: dto.subscriptionId, amount: dto.amount },
    });

    await this.pusher.paymentEvent("payment.recorded", {
      id: payment._id.toString(),
      clientId: dto.clientId,
      subscriptionId: dto.subscriptionId,
      amount: dto.amount,
    });

    // Portal realtime — subscriber sees balance update
    await this.pusher.portalEvent(dto.clientId, "payment.recorded", {
      subscriptionId: dto.subscriptionId,
      amount: dto.amount,
    });

    return payment.toObject();
  }

  async reverse(paymentId: string, actorId: string, actorName: string) {
    const payment = await this.model.findById(paymentId).exec();
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.reversed) throw new BadRequestException("Payment already reversed");

    payment.reversed = true;
    payment.reversedAt = new Date();
    payment.reversedByUserId = actorId;
    await payment.save();

    // Deduct from subscription
    if (payment.subscriptionId) {
      await this.subscriptions.reversePayment(payment.subscriptionId, payment.amount);
    }

    await this.audit.record({
      actorId,
      actorName,
      action: "payment.reverse",
      entityType: "Payment",
      entityId: paymentId,
      changes: { amount: payment.amount, subscriptionId: payment.subscriptionId },
    });

    await this.pusher.paymentEvent("payment.reversed", {
      id: paymentId,
      clientId: payment.clientId,
      subscriptionId: payment.subscriptionId,
    });

    return { ok: true };
  }
}
