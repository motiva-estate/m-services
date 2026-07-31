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
  UploadedFiles,
  BadRequestException,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
} from "@nestjs/swagger";
import { ProjectUpdatesService } from "./project-updates.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CapabilitiesGuard, Can } from "../common/guards/capabilities.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

const MAX_PHOTOS = 10;
const MAX_SIZE = 15 * 1024 * 1024;

@ApiTags("Project Updates")
@Controller("project-updates")
export class ProjectUpdatesController {
  constructor(private svc: ProjectUpdatesService) {}

  @Get()
  @ApiOperation({ summary: "List project updates" })
  @ApiQuery({ name: "projectRef", required: false })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", default: 1 } })
  @ApiQuery({ name: "limit", required: false, schema: { type: "integer", default: 20 } })
  @ApiResponse({ status: 200, description: "{ data, total, page, limit }" })
  list(
    @Query("projectRef") projectRef?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    return this.svc.list({ projectRef }, Number(page), Number(limit));
  }

  @Get("for-project/:ref")
  @ApiOperation({ summary: "Updates for a project" })
  @ApiParam({ name: "ref" })
  @ApiResponse({ status: 200, description: "Array of updates" })
  forProject(@Param("ref") ref: string) {
    return this.svc.listForProject(ref);
  }

  @Get("for-client")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Updates for subscriber (portal)" })
  @ApiResponse({ status: 200, description: "Array of updates" })
  forClient(@CurrentUser() user: any) {
    if (!user.clientId) throw new BadRequestException("Not a subscriber account");
    return this.svc.listForClient(user.clientId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get update by ID" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Update record" })
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can("content.create")
  @ApiBearerAuth("access-token")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Create project update (with optional photos)" })
  @ApiResponse({ status: 201, description: "Created" })
  @UseInterceptors(FilesInterceptor("photos", MAX_PHOTOS, { limits: { fileSize: MAX_SIZE } }))
  async create(
    @Body("projectRef") projectRef: string,
    @Body("projectRefType") projectRefType: "project" | "land",
    @Body("text") text: string,
    @UploadedFiles() photos: Express.Multer.File[],
    @CurrentUser() actor: any,
  ) {
    if (!projectRef || !text) throw new BadRequestException("projectRef and text are required");
    const dto = { projectRef, projectRefType: projectRefType ?? "project", text };
    if (photos?.length) {
      return this.svc.createWithPhotos(
        dto,
        photos.map((f) => ({ buffer: f.buffer, originalName: f.originalname })),
        actor.id,
        actor.fullName,
      );
    }
    return this.svc.create(dto, actor.id, actor.fullName);
  }

  @Post(":id/photos")
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can("content.create")
  @ApiBearerAuth("access-token")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Add photos to existing update" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 201, description: "Photos added" })
  @UseInterceptors(FilesInterceptor("photos", MAX_PHOTOS, { limits: { fileSize: MAX_SIZE } }))
  async addPhotos(
    @Param("id") id: string,
    @UploadedFiles() photos: Express.Multer.File[],
    @Body("caption") caption: string,
    @CurrentUser() actor: any,
  ) {
    if (!photos?.length) throw new BadRequestException("No photos provided");
    return Promise.all(
      photos.map((f) =>
        this.svc.uploadPhoto(id, f.buffer, f.originalname, caption, actor.id, actor.fullName),
      ),
    );
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @Can("content.create")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Delete project update" })
  @ApiParam({ name: "id" })
  @ApiResponse({ status: 200, description: "Deleted" })
  remove(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.svc.remove(id, actor.id, actor.fullName);
  }
}
