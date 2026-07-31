import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../schemas/user.schema';

export type Action =
  | 'content.create'
  | 'content.edit'
  | 'content.publish'
  | 'content.archive'
  | 'seo.manage'
  | 'contact.manage'
  | 'homepage.manage'
  | 'clients.manage'
  | 'subscriptions.manage'
  | 'enquiries.assign'
  | 'users.manage'
  | 'audit.view'
  | 'settings.manage';

export const CAPABILITIES: Record<Role, Action[]> = {
  SUPER_ADMIN: [
    'content.create', 'content.edit', 'content.publish', 'content.archive',
    'seo.manage', 'contact.manage', 'homepage.manage', 'clients.manage',
    'subscriptions.manage', 'enquiries.assign', 'users.manage', 'audit.view', 'settings.manage',
  ],
  ADMINISTRATOR: [
    'content.create', 'content.edit', 'content.publish', 'content.archive',
    'seo.manage', 'contact.manage', 'homepage.manage', 'clients.manage',
    'subscriptions.manage', 'enquiries.assign', 'audit.view',
  ],
  CONTENT_EDITOR: ['content.create', 'content.edit', 'clients.manage', 'enquiries.assign'],
  VIEWER: [],
  SUBSCRIBER: [],
};

export const CAN_KEY = 'can_action';
export const Can = (...actions: Action[]) =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@nestjs/common').SetMetadata(CAN_KEY, actions);

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Action[]>(CAN_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');

    const allowed = CAPABILITIES[user.role as Role] ?? [];
    const missing = required.filter((a) => !allowed.includes(a));
    if (missing.length > 0) {
      throw new ForbiddenException(`Insufficient permissions: ${missing.join(', ')}`);
    }
    return true;
  }
}
