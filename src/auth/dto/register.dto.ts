import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Role } from "../../common/schemas/user.schema";

export class RegisterDto {
  @ApiProperty({ example: "Tolu Adesanya", description: "Full display name" })
  @IsString()
  fullName: string;

  @ApiProperty({ example: "tolu@motivaestate.com", description: "Unique email address" })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: "SecurePass99!",
    description: "Initial password (min 8 chars)",
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    enum: ["SUPER_ADMIN", "ADMINISTRATOR", "CONTENT_EDITOR", "VIEWER", "SUBSCRIBER"],
    default: "VIEWER",
    description: "Role assigned to the new account",
  })
  @IsEnum(["SUPER_ADMIN", "ADMINISTRATOR", "CONTENT_EDITOR", "VIEWER", "SUBSCRIBER"])
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({
    example: "665f1a2b3c4d5e6f7a8b9c0d",
    description: "MongoDB _id of the Client record — required when role is SUBSCRIBER",
  })
  @IsOptional()
  @IsString()
  clientId?: string;
}
