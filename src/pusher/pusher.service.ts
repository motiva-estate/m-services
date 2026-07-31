import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Pusher from 'pusher';

// ─── Channel / event naming conventions ──────────────────────────────────────
//
// Admin channels (private — access controlled by auth):
//   private-admin                    → broadcasts to all admin users
//   private-admin-clients            → client CRM events
//   private-admin-subscriptions      → subscription events
//   private-admin-payments           → payment events
//   private-admin-enquiries          → enquiry pipeline events
//
// Portal channels (private per subscriber):
//   private-portal-{clientId}        → subscriber-specific events
//
// Events:
//   client.created / client.updated / client.deleted
//   subscription.created / subscription.updated
//   payment.recorded / payment.reversed
//   enquiry.created / enquiry.updated
//   document.uploaded / document.deleted
//   update.posted / update.deleted
// ─────────────────────────────────────────────────────────────────────────────

export type AdminChannel =
  | "private-admin"
  | "private-admin-clients"
  | "private-admin-subscriptions"
  | "private-admin-payments"
  | "private-admin-enquiries";

@Injectable()
export class PusherService {
  private pusher: Pusher;
  private readonly logger = new Logger(PusherService.name);
  private readonly enabled: boolean;

  constructor(private config: ConfigService) {
    const appId = config.get<string>("PUSHER_APP_ID");
    const key = config.get<string>("PUSHER_KEY");
    const secret = config.get<string>("PUSHER_SECRET");
    const cluster = config.get<string>("PUSHER_CLUSTER", "eu");

    this.enabled = !!(appId && key && secret);

    if (this.enabled) {
      this.pusher = new Pusher({ appId, key, secret, cluster, useTLS: true });
      this.logger.log(`Pusher connected (cluster: ${cluster})`);
    } else {
      this.logger.warn("Pusher credentials not set — realtime events disabled");
    }
  }

  // ── Generic trigger ───────────────────────────────────────────────────────
  async trigger(channel: string, event: string, data: Record<string, unknown>) {
    if (!this.enabled) return;
    try {
      await this.pusher.trigger(channel, event, data);
      return { success: true }; // return something JSON-safe, not the raw response
    } catch (err) {
      this.logger.error(`Pusher trigger failed [${channel}/${event}]: ${err}`);
    }
  }

  // ── Auth endpoint helper (for private channels) ───────────────────────────
  authorizeChannel(socketId: string, channel: string) {
    if (!this.enabled) return null;
    return this.pusher.authorizeChannel(socketId, channel);
  }

  // ── Convenience emitters ──────────────────────────────────────────────────

  async clientEvent(event: string, data: Record<string, unknown>) {
    await this.trigger("private-admin-clients", event, data);
    await this.trigger("private-admin", event, data);
  }

  async subscriptionEvent(event: string, data: Record<string, unknown>) {
    await this.trigger("private-admin-subscriptions", event, data);
    await this.trigger("private-admin", event, data);
  }

  async paymentEvent(event: string, data: Record<string, unknown>) {
    await this.trigger("private-admin-payments", event, data);
    await this.trigger("private-admin", event, data);
  }

  async enquiryEvent(event: string, data: Record<string, unknown>) {
    await this.trigger("private-admin-enquiries", event, data);
    await this.trigger("private-admin", event, data);
  }

  async portalEvent(clientId: string, event: string, data: Record<string, unknown>) {
    await this.trigger(`private-portal-${clientId}`, event, data);
  }

  async documentEvent(clientId: string | undefined, event: string, data: Record<string, unknown>) {
    if (clientId) await this.portalEvent(clientId, event, data);
    await this.trigger("private-admin", event, data);
  }

  async updateEvent(projectRef: string, event: string, data: Record<string, unknown>) {
    // Broadcast to admin
    await this.trigger("private-admin", event, data);
    // Broadcast to project-specific channel (portal clients subscribe to this)
    await this.trigger(`private-project-${projectRef}`, event, data);
  }
}
