import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../common/schemas/user.schema';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PusherService } from '../pusher/pusher.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private model: Model<UserDocument>,
    private audit: AuditLogService,
    private pusher: PusherService,
  ) {}

  async list() {
    return this.model.find().sort({ createdAt: -1 }).lean().exec();
  }

  async get(id: string) {
    const u = await this.model.findById(id).lean().exec();
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async create(dto: Partial<User> & { password?: string }, actorId: string, actorName: string) {
    const exists = await this.model.findOne({ email: dto.email?.toLowerCase() });
    if (exists) throw new ConflictException('Email already registered');

    const password = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : await bcrypt.hash(Math.random().toString(36), 12); // temp password

    const user = await this.model.create({ ...dto, email: dto.email?.toLowerCase(), password });
    await this.audit.record({ actorId, actorName, action: 'user.create', entityType: 'User', entityId: user._id.toString() });
    await this.pusher.trigger('private-admin', 'user.created', { id: user._id.toString() });
    return user.toObject();
  }

  async update(id: string, dto: Partial<User>, actorId: string, actorName: string) {
    const before = await this.model.findById(id).lean().exec();
    if (!before) throw new NotFoundException('User not found');

    // Never update password via this method
    const { password: _, refreshTokenHash: __, twoFASecret: ___, ...safe } = dto as any;
    const updated = await this.model.findByIdAndUpdate(id, safe, { new: true }).lean().exec();
    await this.audit.record({ actorId, actorName, action: 'user.update', entityType: 'User', entityId: id, changes: safe });
    await this.pusher.trigger('private-admin', 'user.updated', { id });
    return updated;
  }

  async remove(id: string, actorId: string, actorName: string) {
    const u = await this.model.findByIdAndDelete(id).exec();
    if (!u) throw new NotFoundException('User not found');
    await this.audit.record({ actorId, actorName, action: 'user.delete', entityType: 'User', entityId: id });
    await this.pusher.trigger('private-admin', 'user.deleted', { id });
    return { ok: true };
  }

  async findByEmail(email: string) {
    return this.model.findOne({ email: email.toLowerCase() }).exec();
  }
}
