import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
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
import { DocumentsService } from "./documents.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CapabilitiesGuard, Can } from "../common/guards/capabilities.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { DocumentCategory } from "../common/schemas/document.schema";

const MAX_SIZE = 20 * 1024 * 1024;

@ApiTags("Documents")
@ApiBearerAuth("access-token")
@Controller("documents")
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private svc: DocumentsService) {}

  @Get()
  @UseGuards(CapabilitiesGuard)
  @Can("subscriptions.manage")
  @ApiOperation({ summary: "List documents (admin)" })
  @ApiQuery({ name: "subscriptionId", required: false })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", default: 1 } })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", default: 20 } })
  @ApiResponse({ status: 200, description: "{ data, total, page, limit }" })
  list(
    @Query("subscriptionId") subscriptionId?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    return this.svc.list({ subscriptionId }, Number(page), Number(limit));
  }

  @Get("for-client/:clientId")
  @UseGuards(CapabilitiesGuard)
  @Can("clients.manage")
  @ApiOperation({ summary: "Documents for a client (admin)" })
  @ApiParam({ name: "clientId" })
  @ApiResponse({ status: 200, description: "Array of documents" })
  listForClient(@Param("clientId") clientId: string) {
    return this.svc.listForClient(clientId);
  }

  @Get("for-subscription/:subscriptionId")
  @ApiOperation({ summary: "Documents for a subscription" })
  @ApiParam({ name: "subscriptionId" })
  @ApiResponse({ status: 200, description: "Array of documents" })
  listForSubscription(@Param("subscriptionId") subscriptionId: string) {
    return this.svc.listForSubscription(subscriptionId);
  }

  @Post("upload")
  @UseGuards(CapabilitiesGuard)
  @Can("subscriptions.manage")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload a document (admin)" })
  @ApiResponse({ status: 201, description: "Uploaded" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_SIZE } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body("subscriptionId") subscriptionId: string,
    @Body("label") label: string,
    @Body("visibility") visibility: string,
    @Body("category") category: DocumentCategory,
    @CurrentUser() actor: any,
  ) {
    if (!file) throw new BadRequestException("No file provided");
    if (!subscriptionId) throw new BadRequestException("subscriptionId required");
    if (!label) throw new BadRequestException("label required");
    return this.svc.upload(
      subscriptionId,
      label,
      visibility ?? "immediate",
      category ?? "other",
      file.buffer,
      file.originalname,
      actor.id,
      actor.fullName,
    );
  }

  @Delete(":id")
  @UseGuards(CapabilitiesGuard)
  @Can("subscriptions.manage")
  @ApiOperation({ summary: "Delete document (admin)" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Deleted" })
  remove(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.svc.remove(id, actor.id, actor.fullName);
  }

  @Get("portal/my-documents")
  @ApiOperation({ summary: "My documents (subscriber portal)" })
  @ApiResponse({ status: 200, description: "Visibility-filtered documents" })
  listPortal(@CurrentUser() user: any) {
    if (!user.clientId) throw new BadRequestException("Not a subscriber account");
    return this.svc.listForPortal(user.clientId);
  }

  @Get("portal/:id/download")
  @ApiOperation({ summary: "Get signed download URL (subscriber portal)" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "{ url, expiresIn }" })
  getDownloadUrl(@Param("id") id: string, @CurrentUser() user: any) {
    if (!user.clientId) throw new BadRequestException("Not a subscriber account");
    return this.svc.getDownloadUrl(id, user.clientId);
  }
}
