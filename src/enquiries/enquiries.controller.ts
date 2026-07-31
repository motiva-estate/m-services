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
import { EnquiriesService } from "./enquiries.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CapabilitiesGuard, Can } from "../common/guards/capabilities.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Enquiries")
@Controller("enquiries")
export class EnquiriesController {
  constructor(private svc: EnquiriesService) {}

  @Post("public")
  @ApiOperation({ summary: "Submit public enquiry (no auth)" })
  @ApiResponse({ status: 201, description: "Enquiry created" })
  createPublic(@Body() dto: any) {
    return this.svc.createPublic(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can("enquiries.assign")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "List enquiries" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"],
  })
  @ApiQuery({ name: "assignedToId", required: false })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", default: 1 } })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", default: 20 } })
  @ApiResponse({ status: 200, description: "{ data, total, page, limit }" })
  list(
    @Query("status") status?: string,
    @Query("assignedToId") assignedToId?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    return this.svc.list({ status, assignedToId }, Number(page), Number(limit));
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can("enquiries.assign")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Get enquiry by ID" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Enquiry record" })
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can("enquiries.assign")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Update enquiry" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Updated" })
  update(@Param("id") id: string, @Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.update(id, dto, actor.id, actor.fullName);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can("clients.manage")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Delete enquiry" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Deleted" })
  remove(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.svc.remove(id, actor.id, actor.fullName);
  }
}
