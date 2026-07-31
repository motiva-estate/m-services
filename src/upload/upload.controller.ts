import {
  Controller, Post, UseGuards, UseInterceptors,
  UploadedFile, Body, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CloudinaryService, UploadCategory } from '../cloudinary/cloudinary.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

/**
 * Generic single-file upload endpoint.
 * Used by the admin frontend CloudinaryUpload widget for content images
 * (project covers, gallery images, team photos, etc.).
 *
 * Returns: { publicId, secureUrl, resourceType, format }
 */
@ApiTags('Upload')
@ApiBearerAuth('access-token')
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private cloudinary: CloudinaryService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Generic file upload',
    description:
      'Uploads a single file to Cloudinary. Accepts an optional `category` field to route ' +
      'the file to the correct folder. Returns the Cloudinary `secureUrl` which should be ' +
      'stored in the relevant Sanity document or CRM record.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        category: {
          type: 'string',
          enum: ['update_photo', 'kyc_photo', 'kyc_id', 'kyc_utility', 'other'],
          default: 'other',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Upload successful',
    schema: {
      properties: {
        publicId:     { type: 'string' },
        secureUrl:    { type: 'string' },
        resourceType: { type: 'string' },
        format:       { type: 'string' },
        bytes:        { type: 'number' },
        width:        { type: 'number' },
        height:       { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No file provided' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');

    const allowed: UploadCategory[] = [
      'update_photo', 'kyc_photo', 'kyc_id', 'kyc_utility', 'other',
    ];
    const cat: UploadCategory = allowed.includes(category as UploadCategory)
      ? (category as UploadCategory)
      : 'other';

    return this.cloudinary.uploadBuffer(file.buffer, cat, file.originalname);
  }
}
