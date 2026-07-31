import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { User, UserDocument } from '../common/schemas/user.schema';
import { AuditLogService } from '../audit-log/audit-log.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private config: ConfigService,
    private auditLog: AuditLogService,
  ) {}

  // ── Registration ────────────────────────────────────────────────
  async register(dto: RegisterDto, actorId?: string) {
    const exists = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (exists) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      password: hash,
      role: dto.role ?? 'VIEWER',
      clientId: dto.clientId,
    });

    if (actorId) {
      await this.auditLog.record({
        actorId,
        actorName: 'System',
        action: 'user.create',
        entityType: 'User',
        entityId: user._id.toString(),
      });
    }

    return this.sanitize(user);
  }

  // ── Login ────────────────────────────────────────────────────────
  async login(dto: LoginDto, ip?: string) {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+password')
      .exec();

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new ForbiddenException('Account is deactivated');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // 2FA check — if enabled, require TOTP token (handled in controller via separate step)
     // 2FA gate — stop here if enabled, require separate verify step
    if (user.twoFAEnabled) {
      if (!dto.twoFAToken) {
        return { requires2FA: true, userId: user._id.toString() };
      }
      const validTOTP = await this.verify2FA(user._id.toString(), dto.twoFAToken);
      if (!validTOTP) throw new UnauthorizedException('Invalid 2FA token');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await this.generateTokens(user);

    await this.auditLog.record({
      actorId: user._id.toString(),
      actorName: user.fullName,
      action: 'auth.login',
      entityType: 'User',
      entityId: user._id.toString(),
      ipAddress: ip,
    });

    return { user: this.sanitize(user), ...tokens };
  }

  // ── Token helpers ────────────────────────────────────────────────
  async generateTokens(user: UserDocument) {
    const payload = { sub: user._id.toString(), email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_SECRET', 'change-me-in-production'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', 'change-me-refresh'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    // Store hashed refresh token
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.userModel.findByIdAndUpdate(user._id, { refreshTokenHash: hash });

    return { accessToken, refreshToken };
  }

  async refreshTokens(userId: string, rawRefreshToken: string) {
    const user = await this.userModel.findById(userId).select('+refreshTokenHash').exec();
    if (!user?.refreshTokenHash) throw new UnauthorizedException();

    const valid = await bcrypt.compare(rawRefreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Refresh token invalid or expired');

    return this.generateTokens(user);
  }

  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokenHash: null });
  }

  // ── Password ─────────────────────────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId).select('+password').exec();
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    user.password = await bcrypt.hash(dto.newPassword, 12);
    await user.save();
    return { ok: true };
  }

  // ── 2FA ──────────────────────────────────────────────────────────
  async setup2FA(userId: string) {
    const secret = speakeasy.generateSecret({ name: 'Motiva Admin', length: 20 });
    await this.userModel.findByIdAndUpdate(userId, { twoFASecret: secret.base32 });
    return { secret: secret.base32, otpauthUrl: secret.otpauth_url };
  }

  async enable2FA(userId: string, token: string) {
    const user = await this.userModel.findById(userId).select('+twoFASecret').exec();
    if (!user?.twoFASecret) throw new BadRequestException('2FA not initialised');

    const valid = speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!valid) throw new BadRequestException('Invalid TOTP token');

    user.twoFAEnabled = true;
    await user.save();
    return { ok: true };
  }

  async verify2FA(userId: string, token: string) {
    const user = await this.userModel.findById(userId).select('+twoFASecret').exec();
    if (!user?.twoFAEnabled || !user.twoFASecret) return true; // 2FA not enabled

    return speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: 'base32',
      token,
      window: 1,
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────
  sanitize(user: UserDocument) {
    const obj = user.toObject();
    delete obj.password;
    delete obj.refreshTokenHash;
    delete obj.twoFASecret;
    return obj;
  }
}
