import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client, ClientDocument } from '../common/schemas/client.schema';
import { Subscription, SubscriptionDocument } from '../common/schemas/subscription.schema';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PusherService } from '../pusher/pusher.service';

export interface UpdateProfileDto {
  email?: string;
  phone?: string;
  contactConfirmedAt?: string;
  notificationPrefs?: { email: boolean; whatsapp: boolean };
}

@Injectable()
export class PortalService {
  constructor(
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    private audit: AuditLogService,
    private pusher: PusherService,
  ) {}

  // ── GET /api/portal/me ────────────────────────────────────────────────────
  async getProfile(clientId: string) {
    const client = await this.clientModel.findById(clientId).lean().exec();
    if (!client) throw new NotFoundException('Client record not found');
    return client;
  }

  // ── PATCH /api/portal/me ──────────────────────────────────────────────────
  // Subscribers may only update contact details and notification prefs.
  // They cannot change their status, source, KYC fields, or subscription data.
  async updateProfile(clientId: string, dto: UpdateProfileDto, userId: string, userFullName: string) {
    const allowed: (keyof UpdateProfileDto)[] = [
      'email',
      'phone',
      'contactConfirmedAt',
      'notificationPrefs',
    ];

    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) patch[key] = dto[key];
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No updatable fields provided');
    }

    const updated = await this.clientModel
      .findByIdAndUpdate(clientId, { ...patch, updatedAt: new Date() }, { new: true })
      .lean()
      .exec();

    if (!updated) throw new NotFoundException('Client record not found');

    await this.audit.record({
      actorId: userId,
      actorName: userFullName,
      action: 'portal.profile_update',
      entityType: 'Client',
      entityId: clientId,
      changes: patch,
    });

    // Notify portal channel so other open tabs refresh
    await this.pusher.portalEvent(clientId, 'profile.updated', { clientId });

    return updated;
  }

  // ── GET /api/portal/subscriptions ────────────────────────────────────────
  async listSubscriptions(clientId: string) {
    return this.subModel
      .find({ clientId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  // ── GET /api/portal/subscriptions/:id ────────────────────────────────────
  async getSubscription(id: string, clientId: string) {
    const sub = await this.subModel.findById(id).lean().exec();
    if (!sub) throw new NotFoundException('Subscription not found');
    if ((sub as any).clientId !== clientId) throw new ForbiddenException('Not your subscription');
    return sub;
  }
}
