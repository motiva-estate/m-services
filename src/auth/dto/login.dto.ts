import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "admin@motivaestate.com", description: "Registered email address" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "SuperAdmin123!", description: "Account password", minLength: 1 })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({
    example: "123456",
    description: "TOTP token — required only when 2FA is enabled on the account",
  })
  @IsOptional()
  @IsString()
  twoFAToken?: string;
}
