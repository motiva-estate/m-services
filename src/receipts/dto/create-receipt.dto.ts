import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PaymentEntryDto {
  @ApiProperty({ example: '30-10-2026' })
  @IsString()
  paymentDate: string;

  @ApiProperty({ example: 'Bank Transfer' })
  @IsString()
  paymentMethod: string;

  @ApiPropertyOptional({ example: 'GTBank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: '0123456789' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreateReceiptDto {
  @ApiProperty({ example: '30-10-2026', description: 'Date issued in DD-MM-YYYY format' })
  @IsString()
  dateIssued: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsString()
  clientId: string;

  @ApiProperty({ example: 'Payment for Plot 45, Phase 2, Lanzarote Estate' })
  @IsString()
  paymentDescription: string;

  @ApiProperty({ example: 250000 })
  @IsNumber()
  @Min(0)
  amountReceived: number;

  @ApiProperty({ type: [PaymentEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentEntryDto)
  paymentEntries: PaymentEntryDto[];

  @ApiPropertyOptional({ enum: ['DRAFT', 'ISSUED'], default: 'DRAFT' })
  @IsOptional()
  @IsEnum(['DRAFT', 'ISSUED'])
  status?: 'DRAFT' | 'ISSUED';
}

export class UpdateReceiptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateIssued?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountReceived?: number;

  @ApiPropertyOptional({ type: [PaymentEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentEntryDto)
  paymentEntries?: PaymentEntryDto[];

  @ApiPropertyOptional({ enum: ['DRAFT', 'ISSUED'] })
  @IsOptional()
  @IsEnum(['DRAFT', 'ISSUED'])
  status?: 'DRAFT' | 'ISSUED';
}

export class VoidReceiptDto {
  @ApiProperty({ example: 'Receipt issued in error' })
  @IsString()
  reason: string;
}
