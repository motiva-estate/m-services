import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from "@nestjs/swagger";
import { PusherService } from "./pusher.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Pusher")
@ApiBearerAuth("access-token")
@Controller("pusher")
export class PusherController {
  constructor(private pusher: PusherService) {}

  /**
   * POST /api/pusher/auth
   *
   * Called automatically by the Pusher JS SDK when subscribing to a private
   * channel. The JWT must be present; channel access rules:
   *
   * - `private-admin*`        → any non-SUBSCRIBER role
   * - `private-portal-{id}`  → SUBSCRIBER whose `clientId` matches `{id}`
   * - `private-project-{ref}` → SUBSCRIBER or SUPER_ADMIN / ADMINISTRATOR
   */
  @Post("auth")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Authenticate Pusher private channel",
    description:
      "Called by the Pusher JS SDK (`pusher.channel.authorize`). " +
      "Validates the authenticated user's access to the requested channel and returns a signed auth payload. " +
      "Do not call this manually — it is invoked automatically by the SDK.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["socket_id", "channel_name"],
      properties: {
        socket_id: { type: "string", example: "1234.5678" },
        channel_name: { type: "string", example: "private-portal-665f1a2b3c4d5e6f7a8b9c0d" },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "Pusher auth payload",
    schema: {
      properties: { auth: { type: "string", example: "app_key:hmac_signature" } },
    },
  })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  @ApiResponse({
    status: 201,
    description: "Access denied (returns JSON error body)",
    schema: { properties: { error: { type: "string", example: "Forbidden" } } },
  })
  auth(
    @Body("socket_id") socketId: string,
    @Body("channel_name") channel: string,
    @CurrentUser() user: any,
  ) {
    if (channel.startsWith("private-admin")) {
      if (user.role === "SUBSCRIBER") return { error: "Forbidden" };
    }

    if (channel.startsWith("private-portal-")) {
      const clientId = channel.replace("private-portal-", "");
      if (user.role !== "SUBSCRIBER" || user.clientId !== clientId) {
        return { error: "Forbidden" };
      }
    }

    if (channel.startsWith("private-project-")) {
      if (!["SUBSCRIBER", "SUPER_ADMIN", "ADMINISTRATOR"].includes(user.role)) {
        return { error: "Forbidden" };
      }
    }

    return this.pusher.authorizeChannel(socketId, channel);
  }
}
