import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ChangePasswordDto {
  @ApiProperty({ example: "OldPassword1!", description: "Current account password" })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    example: "NewPassword2!",
    description: "Replacement password (min 8 chars)",
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
