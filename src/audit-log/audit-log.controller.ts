import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { AuditLogService } from "./audit-log.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { Can, CapabilitiesGuard } from "../common/guards/capabilities.guard";

@ApiTags("Audit Log")
@ApiBearerAuth("access-token")
@Controller("audit-log")
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@Can("audit.view")
export class AuditLogController {
  constructor(private svc: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: "List audit log entries" })
  @ApiQuery({ name: "entityType", required: false })
  @ApiQuery({ name: "entityId", required: false })
  @ApiQuery({ name: "actorId", required: false })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", default: 1 } })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", default: 30 } })
  @ApiResponse({ status: 200, description: "{ data, total, page, limit }" })
  list(
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("actorId") actorId?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 30,
  ) {
    return this.svc.list({ entityType, entityId, actorId }, Number(page), Number(limit));
  }
}
