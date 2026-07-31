import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CapabilitiesGuard, Can } from "../common/guards/capabilities.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@ApiTags("Users")
@ApiBearerAuth("access-token")
@Controller("users")
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@Can("users.manage")
export class UsersController {
  constructor(private svc: UsersService) {}

  // GET /api/users
  @Get()
  @ApiOperation({
    summary: "List users",
    description: "Returns all user accounts (staff and subscriber portal accounts).",
  })
  @ApiResponse({
    status: 200,
    description: "Array of user records (password/token fields stripped)",
  })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  @ApiResponse({ status: 403, description: "Requires users.manage capability" })
  list() {
    return this.svc.list();
  }

  // GET /api/users/:id
  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  @ApiParam({ name: "id", description: "User MongoDB _id" })
  @ApiResponse({ status: 200, description: "User record" })
  @ApiResponse({ status: 404, description: "User not found" })
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  // POST /api/users
  @Post()
  @ApiOperation({
    summary: "Create user",
    description:
      "Creates a new user account. For `role: SUBSCRIBER` include `clientId` to link the login to a Client record. " +
      "Note: staff accounts should be created via `POST /auth/register` instead — this endpoint skips the auth audit trail.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["fullName", "email", "password"],
      properties: {
        fullName: { type: "string", example: "Tolu Adesanya" },
        email: { type: "string", example: "tolu@motivaestate.com" },
        password: { type: "string", example: "TempPass99!", minLength: 8 },
        role: {
          type: "string",
          enum: ["SUPER_ADMIN", "ADMINISTRATOR", "CONTENT_EDITOR", "VIEWER", "SUBSCRIBER"],
          default: "VIEWER",
        },
        clientId: { type: "string", description: "Required when role is SUBSCRIBER" },
        isActive: { type: "boolean", default: true },
      },
    },
  })
  @ApiResponse({ status: 201, description: "User created" })
  @ApiResponse({ status: 409, description: "Email already registered" })
  create(@Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.create(dto, actor.id, actor.fullName);
  }

  // PATCH /api/users/:id
  @Patch(":id")
  @ApiOperation({
    summary: "Update user",
    description:
      "Partial update — role, isActive, clientId, etc. Does not expose password change (use PATCH /auth/password).",
  })
  @ApiParam({ name: "id", description: "User MongoDB _id" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        fullName: { type: "string" },
        role: {
          type: "string",
          enum: ["SUPER_ADMIN", "ADMINISTRATOR", "CONTENT_EDITOR", "VIEWER", "SUBSCRIBER"],
        },
        isActive: { type: "boolean" },
        clientId: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Updated user record" })
  @ApiResponse({ status: 404, description: "User not found" })
  update(@Param("id") id: string, @Body() dto: any, @CurrentUser() actor: any) {
    return this.svc.update(id, dto, actor.id, actor.fullName);
  }

  // DELETE /api/users/:id
  @Delete(":id")
  @ApiOperation({
    summary: "Delete user",
    description: "Permanently removes the user account. Audit record is retained.",
  })
  @ApiParam({ name: "id", description: "User MongoDB _id" })
  @ApiResponse({
    status: 200,
    description: "Deleted",
    schema: { properties: { ok: { type: "boolean", example: true } } },
  })
  @ApiResponse({ status: 404, description: "User not found" })
  remove(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.svc.remove(id, actor.id, actor.fullName);
  }
}
