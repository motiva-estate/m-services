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

// Cookie options that work across different origins in production.
// In development: SameSite=Lax keeps things simple on localhost.
// In production: SameSite=None + Secure is required because the frontend
// (e.g. Vercel/Netlify) and the API (Render) are on different domains.
function rtCookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/api/auth",
  };
}

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  // POST /api/auth/login
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in",
    description:
      "Authenticates with email + password. Returns an `accessToken` (short-lived JWT) " +
      "and sets an HttpOnly `motiva_rt` refresh-token cookie. " +
      "If 2FA is enabled on the account the response is `{ requires2FA: true, userId }` — " +
      "re-submit the same body with the current TOTP code in `twoFAToken`.",
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: "Login successful",
    schema: {
      oneOf: [
        {
          title: "AuthSuccess",
          properties: {
            accessToken: { type: "string", example: "eyJhbGci..." },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                fullName: { type: "string" },
                email: { type: "string" },
                role: {
                  type: "string",
                  enum: ["SUPER_ADMIN", "ADMINISTRATOR", "CONTENT_EDITOR", "VIEWER", "SUBSCRIBER"],
                },
              },
            },
          },
        },
        {
          title: "2FA required",
          properties: {
            requires2FA: { type: "boolean", example: true },
            userId: { type: "string" },
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  @ApiResponse({ status: 403, description: "Account deactivated" })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, req.ip);
    if ("requires2FA" in result) return result;

    res.cookie(
      "motiva_rt",
      result.refreshToken,
      rtCookieOptions(process.env.NODE_ENV === "production"),
    );
    return { user: result.user, accessToken: result.accessToken };
  }

  // POST /api/auth/register  (SUPER_ADMIN only)
  @Post("register")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN")
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Register a new user (SUPER_ADMIN only)",
    description:
      "Creates a staff or subscriber account. For `role: SUBSCRIBER` supply the `clientId` of the linked Client record.",
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: "User created" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 409, description: "Email already registered" })
  async register(@Body() dto: RegisterDto, @CurrentUser() actor: any) {
    return this.auth.register(dto, actor.id);
  }

  // POST /api/auth/refresh
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("motiva_rt")
  @ApiOperation({
    summary: "Refresh access token",
    description:
      "Uses the `motiva_rt` HttpOnly cookie to issue a new access token and rotate the refresh token. " +
      "Called automatically by the frontend SDK on 401 responses.",
  })
  @ApiResponse({
    status: 200,
    description: "New access token issued",
    schema: { properties: { accessToken: { type: "string", example: "eyJhbGci..." } } },
  })
  @ApiResponse({ status: 401, description: "Missing or invalid refresh token" })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.["motiva_rt"];
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const result = await this.auth.refreshTokens(payload.sub, token);

    res.cookie(
      "motiva_rt",
      result.refreshToken,
      rtCookieOptions(process.env.NODE_ENV === "production"),
    );
    return { accessToken: result.accessToken };
  }

  // POST /api/auth/logout
  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Sign out",
    description: "Invalidates the refresh token and clears the cookie.",
  })
  @ApiResponse({
    status: 200,
    description: "Signed out",
    schema: { properties: { ok: { type: "boolean", example: true } } },
  })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  async logout(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id);
    res.clearCookie("motiva_rt", { path: "/api/auth" });
    return { ok: true };
  }

  // GET /api/auth/me
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Get current user",
    description: "Returns the authenticated user profile decoded from the JWT.",
  })
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
  @ApiOperation({
    summary: "Change password",
    description: "Verifies the current password then replaces it with the new one.",
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: 200,
    description: "Password changed",
    schema: { properties: { ok: { type: "boolean", example: true } } },
  })
  @ApiResponse({ status: 400, description: "Current password incorrect" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  // POST /api/auth/2fa/setup
  @Post("2fa/setup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Initialise 2FA",
    description:
      "Generates a TOTP secret and returns a `secret` (base32) and `otpauthUrl` for QR-code display. Call `POST /auth/2fa/enable` with the first valid token to activate.",
  })
  @ApiResponse({
    status: 201,
    description: "2FA secret generated",
    schema: {
      properties: {
        secret: { type: "string", example: "JBSWY3DPEHPK3PXP" },
        otpauthUrl: {
          type: "string",
          example: "otpauth://totp/Motiva%20Admin:user%40example.com?secret=...",
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  setup2FA(@CurrentUser() user: any) {
    return this.auth.setup2FA(user.id);
  }

  // POST /api/auth/2fa/enable
  @Post("2fa/enable")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "Enable 2FA",
    description:
      "Confirms the TOTP setup by verifying the first live token. 2FA is active on all subsequent logins after this call.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["token"],
      properties: { token: { type: "string", example: "123456" } },
    },
  })
  @ApiResponse({
    status: 200,
    description: "2FA enabled",
    schema: { properties: { ok: { type: "boolean", example: true } } },
  })
  @ApiResponse({ status: 400, description: "Invalid TOTP token or 2FA not initialised" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  enable2FA(@CurrentUser() user: any, @Body("token") token: string) {
    return this.auth.enable2FA(user.id, token);
  }
}
