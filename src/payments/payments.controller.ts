import { Controller, Get, Post, Param, Query, Body, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CapabilitiesGuard, Can } from "../common/guards/capabilities.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Payments")
@ApiBearerAuth("access-token")
@Controller("payments")
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: "List all payments" })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", default: 1 } })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", default: 20 } })
  @ApiResponse({ status: 200, description: "{ data, total, page, limit }" })
  list(@Query("page") page = 1, @Query("limit") limit = 20) {
    return this.svc.list(Number(page), Number(limit));
  }

  @Get("by-client/:clientId")
  @ApiOperation({ summary: "Payments by client" })
  @ApiParam({ name: "clientId" })
  @ApiResponse({ status: 200, description: "Array of payments" })
  byClient(@Param("clientId") clientId: string) {
    return this.svc.byClient(clientId);
  }

  @Get("by-subscription/:subscriptionId")
  @ApiOperation({ summary: "Payments by subscription" })
  @ApiParam({ name: "subscriptionId" })
  @ApiResponse({ status: 200, description: "Array of payments" })
  bySubscription(@Param("subscriptionId") subId: string) {
    return this.svc.bySubscription(subId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get payment by ID" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Payment record" })
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Can("subscriptions.manage")
  @ApiOperation({ summary: "Record a payment" })
  @ApiResponse({ status: 201, description: "Payment recorded" })
  record(@Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.record(dto, actor.id, actor.fullName);
  }

  @Post(":id/reverse")
  @Can("subscriptions.manage")
  @ApiOperation({ summary: "Reverse a payment" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 201, description: "Reversed" })
  reverse(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.svc.reverse(id, actor.id, actor.fullName);
  }
}
