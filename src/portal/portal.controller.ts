import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";
import { PortalService, UpdateProfileDto } from "./portal.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

/**
 * All routes require a valid JWT but NO admin capability.
 * Accessible to role=SUBSCRIBER. Every handler scopes to user.clientId.
 */
@ApiTags("Portal")
@ApiBearerAuth("access-token")
@Controller("portal")
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private svc: PortalService) {}

  // ── Profile ───────────────────────────────────────────────────────────────

  // GET /api/portal/me
  @Get("me")
  @ApiOperation({
    summary: "Get subscriber profile",
    description: "Returns the Client record linked to the authenticated subscriber account.",
  })
  @ApiResponse({ status: 200, description: "Client record for the logged-in subscriber" })
  @ApiResponse({ status: 400, description: "Not a subscriber account (no clientId on user)" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  getProfile(@CurrentUser() user: any) {
    this.assertSubscriber(user);
    return this.svc.getProfile(user.clientId);
  }

  // PATCH /api/portal/me
  @Patch("me")
  @ApiOperation({
    summary: "Update subscriber profile",
    description:
      "Allows a subscriber to update their own contact details and notification preferences. " +
      "Only `email`, `phone`, `contactConfirmedAt`, and `notificationPrefs` may be changed — " +
      "all other Client fields are read-only from the portal.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        email: { type: "string", example: "elena@example.com" },
        phone: { type: "string", example: "+234 801 234 5678" },
        contactConfirmedAt: {
          type: "string",
          format: "date-time",
          description: "Set to current timestamp when the subscriber confirms their details",
        },
        notificationPrefs: {
          type: "object",
          properties: {
            email: { type: "boolean", example: true },
            whatsapp: { type: "boolean", example: false },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Updated Client record" })
  @ApiResponse({
    status: 400,
    description: "No updatable fields provided or not a subscriber account",
  })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    this.assertSubscriber(user);
    return this.svc.updateProfile(user.clientId, dto, user.id, user.fullName);
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  // GET /api/portal/subscriptions
  @Get("subscriptions")
  @ApiOperation({
    summary: "List own subscriptions",
    description:
      "Returns all subscriptions belonging to the authenticated subscriber, sorted newest first. Includes the full installment schedule.",
  })
  @ApiResponse({ status: 200, description: "Array of subscription records" })
  @ApiResponse({ status: 400, description: "Not a subscriber account" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  listSubscriptions(@CurrentUser() user: any) {
    this.assertSubscriber(user);
    return this.svc.listSubscriptions(user.clientId);
  }

  // GET /api/portal/subscriptions/:id
  @Get("subscriptions/:id")
  @ApiOperation({
    summary: "Get single subscription",
    description:
      "Returns a subscription by id. Throws 403 if the subscription does not belong to the authenticated subscriber.",
  })
  @ApiParam({ name: "id", description: "Subscription MongoDB _id" })
  @ApiResponse({ status: 200, description: "Subscription record" })
  @ApiResponse({ status: 400, description: "Not a subscriber account" })
  @ApiResponse({ status: 403, description: "Subscription belongs to a different subscriber" })
  @ApiResponse({ status: 404, description: "Subscription not found" })
  getSubscription(@Param("id") id: string, @CurrentUser() user: any) {
    this.assertSubscriber(user);
    return this.svc.getSubscription(id, user.clientId);
  }

  // ── Guard helper ──────────────────────────────────────────────────────────
  private assertSubscriber(user: any) {
    if (!user.clientId) {
      throw new BadRequestException("Not a subscriber account — no clientId on this user");
    }
  }
}
