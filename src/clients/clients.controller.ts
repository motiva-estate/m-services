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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiConsumes,
} from "@nestjs/swagger";
import { ClientsService } from "./clients.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CapabilitiesGuard, Can } from "../common/guards/capabilities.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Clients")
@ApiBearerAuth("access-token")
@Controller("clients")
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
export class ClientsController {
  constructor(private svc: ClientsService) {}

  @Get()
  @Can("clients.manage")
  @ApiOperation({ summary: "List clients" })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "status", required: false, enum: ["LEAD", "ACTIVE", "LAPSED", "CONVERTED"] })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", default: 1 } })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", default: 25 } })
  @ApiResponse({ status: 200, description: "{ data, total, page, limit }" })
  list(
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 25,
  ) {
    return this.svc.list({ q, status }, Number(page), Number(limit));
  }

  @Get(":id")
  @Can("clients.manage")
  @ApiOperation({ summary: "Get client by ID" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Client record" })
  @ApiResponse({ status: 404, description: "Not found" })
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Can("clients.manage")
  @ApiOperation({ summary: "Create client" })
  @ApiResponse({ status: 201, description: "Created" })
  create(@Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.create(dto, actor.id, actor.fullName);
  }

  @Patch(":id")
  @Can("clients.manage")
  @ApiOperation({ summary: "Update client" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Updated" })
  update(@Param("id") id: string, @Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.update(id, dto, actor.id, actor.fullName);
  }

  @Delete(":id")
  @Can("clients.manage")
  @ApiOperation({ summary: "Delete client" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Deleted" })
  remove(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.svc.remove(id, actor.id, actor.fullName);
  }

  @Post("import")
  @Can("clients.manage")
  @ApiOperation({ summary: "Bulk import clients" })
  @ApiResponse({ status: 201, description: "{ imported, errors }" })
  bulkImport(@Body("rows") rows: any[], @CurrentUser() actor: any) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException("rows must be a non-empty array");
    }
    return this.svc.bulkImport(rows, actor.id, actor.fullName);
  }

  @Post(":id/kyc/:field")
  @Can("clients.manage")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload KYC document" })
  @ApiParam({ name: "id" })
  @ApiParam({ name: "field", enum: ["idDocumentUrl", "utilityBillUrl", "passportPhotoUrl"] })
  @ApiResponse({ status: 201, description: "Upload successful" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadKyc(
    @Param("id") id: string,
    @Param("field") field: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: any,
  ) {
    const allowed = ["idDocumentUrl", "utilityBillUrl", "passportPhotoUrl"];
    if (!allowed.includes(field)) throw new BadRequestException("Invalid KYC field");
    if (!file) throw new BadRequestException("No file provided");
    return this.svc.uploadKycDocument(
      id,
      field as any,
      file.buffer,
      file.originalname,
      actor.id,
      actor.fullName,
      file.mimetype,
    );
  }
}
