import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { SubscriptionsService } from "./subscriptions.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CapabilitiesGuard, Can } from "../common/guards/capabilities.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Subscriptions")
@ApiBearerAuth("access-token")
@Controller("subscriptions")
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
export class SubscriptionsController {
  constructor(private svc: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: "List subscriptions" })
  @ApiQuery({ name: "clientId", required: false })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["ACTIVE", "PENDING", "EXPIRED", "CANCELLED"],
  })
  @ApiQuery({ name: "projectRef", required: false })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", default: 1 } })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", default: 20 } })
  @ApiResponse({ status: 200, description: "{ data, total, page, limit }" })
  list(
    @Query("clientId") clientId?: string,
    @Query("status") status?: string,
    @Query("projectRef") projectRef?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    return this.svc.list({ clientId, status, projectRef }, Number(page), Number(limit));
  }

  @Get(":id")
  @ApiOperation({ summary: "Get subscription by ID" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Subscription record" })
  @ApiResponse({ status: 404, description: "Not found" })
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Can("subscriptions.manage")
  @ApiOperation({ summary: "Create subscription" })
  @ApiResponse({ status: 201, description: "Created" })
  create(@Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.create(dto, actor.id, actor.fullName);
  }

  @Patch(":id")
  @Can("subscriptions.manage")
  @ApiOperation({ summary: "Update subscription" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Updated" })
  update(@Param("id") id: string, @Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.update(id, dto, actor.id, actor.fullName);
  }

  @Delete(":id")
  @Can("subscriptions.manage")
  @ApiOperation({ summary: "Delete subscription" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Deleted" })
  remove(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.svc.remove(id, actor.id, actor.fullName);
  }
}
