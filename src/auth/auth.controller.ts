import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Patch,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";

const isProd = () => process.env.NODE_ENV === "production";

// ── Cookie helpers ────────────────────────────────────────────────────────────
//
// Admin staff use cookie name "motiva_rt" scoped to /api/auth.
// Subscriber portal users use "motiva_portal_rt" scoped to /api/auth/portal.
//
// Different cookie names + different paths means:
//   - Clearing the admin cookie never touches the portal cookie.
//   - Clearing the portal cookie never touches the admin cookie.
//   - Both can be open in separate browser tabs without interfering.
//
function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: (isProd() ? "none" : "lax") as "none" | "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  };
}

function portalCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: (isProd() ? "none" : "lax") as "none" | "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth/portal",
  };
}

const SUBSCRIBER_ROLE = "SUBSCRIBER";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  // ── Shared login ──────────────────────────────────────────────────────────
  // POST /api/auth/login
  // Accepts both admin staff and subscribers. Sets the appropriate cookie
  // based on role so the two sessions never share a cookie name.
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in (admin staff and portal subscribers)",
    description:
      "Authenticates with email + password. Staff accounts (non-SUBSCRIBER) receive a " +
      "`motiva_rt` cookie scoped to `/api/auth`. Subscriber accounts receive a " +
      "`motiva_portal_rt` cookie scoped to `/api/auth/portal`. " +
      "This ensures that opening both tabs in a browser does not cause session interference.",
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: "Login successful" })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  @ApiResponse({ status: 403, description: "Account deactivated" })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, req.ip);
    if ("requires2FA" in result) return result;

    // Route to the correct cookie based on role.
    if (result.user.role === SUBSCRIBER_ROLE) {
      res.cookie("motiva_portal_rt", result.refreshToken, portalCookieOptions());
    } else {
      res.cookie("motiva_rt", result.refreshToken, adminCookieOptions());
    }

    return { user: result.user, accessToken: result.accessToken };
  }

  // ── Admin register ────────────────────────────────────────────────────────
  // POST /api/auth/register  (SUPER_ADMIN only)
  @Post("register")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Register a new user (SUPER_ADMIN only)" })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: "User created" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 409, description: "Email already registered" })
  async register(@Body() dto: RegisterDto, @CurrentUser() actor: any) {
    return this.auth.register(dto, actor.id);
  }

  // ── Admin refresh ─────────────────────────────────────────────────────────
  // POST /api/auth/refresh  — staff sessions only (motiva_rt cookie)
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("motiva_rt")
  @ApiOperation({
    summary: "Refresh admin access token",
    description:
      "Reads `motiva_rt` cookie (staff sessions only). Called automatically by the admin frontend.",
  })
  @ApiResponse({ status: 200, description: "New access token issued" })
  @ApiResponse({ status: 401, description: "Missing or invalid refresh token" })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.["motiva_rt"];
    if (!token) throw new UnauthorizedException("No refresh token");

    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const result = await this.auth.refreshTokens(payload.sub, token);

    res.cookie("motiva_rt", result.refreshToken, adminCookieOptions());
    return { accessToken: result.accessToken };
  }

  // ── Admin logout ──────────────────────────────────────────────────────────
  // POST /api/auth/logout  — staff sessions only
  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Sign out (admin staff)" })
  @ApiResponse({ status: 200, description: "Signed out" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  async logout(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id);
    res.clearCookie("motiva_rt", { path: "/api/auth" });
    return { ok: true };
  }

  // ── Portal refresh ────────────────────────────────────────────────────────
  // POST /api/auth/portal/refresh  — subscriber portal sessions only (motiva_portal_rt cookie)
  @Post("portal/refresh")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("motiva_portal_rt")
  @ApiOperation({
    summary: "Refresh portal access token",
    description:
      "Reads `motiva_portal_rt` cookie (subscriber sessions only). " +
      "Entirely separate from the admin refresh endpoint — clearing one does not affect the other.",
  })
  @ApiResponse({ status: 200, description: "New access token issued" })
  @ApiResponse({ status: 401, description: "Missing or invalid portal refresh token" })
  async portalRefresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.["motiva_portal_rt"];
    if (!token) throw new UnauthorizedException("No portal refresh token");

    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const result = await this.auth.refreshTokens(payload.sub, token);

    res.cookie("motiva_portal_rt", result.refreshToken, portalCookieOptions());
    return { accessToken: result.accessToken };
  }

  // ── Portal logout ─────────────────────────────────────────────────────────
  // POST /api/auth/portal/logout  — subscriber portal sessions only
  @Post("portal/logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Sign out (subscriber portal)" })
  @ApiResponse({ status: 200, description: "Signed out" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  async portalLogout(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id);
    res.clearCookie("motiva_portal_rt", { path: "/api/auth/portal" });
    return { ok: true };
  }

  // ── Shared endpoints (both roles) ─────────────────────────────────────────
  // GET /api/auth/me
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, description: "Current user profile" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  me(@CurrentUser() user: any) {
    return user;
  }

  // PATCH /api/auth/password
  @Patch("password")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Change password" })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: "Password changed" })
  @ApiResponse({ status: 400, description: "Current password incorrect" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  // POST /api/auth/2fa/setup
  @Post("2fa/setup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Initialise 2FA" })
  @ApiResponse({ status: 201, description: "2FA secret generated" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  setup2FA(@CurrentUser() user: any) {
    return this.auth.setup2FA(user.id);
  }

  // POST /api/auth/2fa/enable
  @Post("2fa/enable")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Enable 2FA" })
  @ApiBody({
    schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } },
  })
  @ApiResponse({ status: 200, description: "2FA enabled" })
  @ApiResponse({ status: 400, description: "Invalid TOTP token" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  enable2FA(@CurrentUser() user: any, @Body("token") token: string) {
    return this.auth.enable2FA(user.id, token);
  }
}
