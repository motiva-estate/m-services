import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

// ─── Folder routing map ───────────────────────────────────────────────────────
// Every upload lands in:  motiva/<environment>/<folder>/<optional-subfolder>
//
// Category          → Cloudinary folder                   | Resource type
// ------------------+--------------------------------------|---------------
// receipt           → motiva/documents/receipts            | raw (PDF)
// offer_letter      → motiva/documents/offer-letters       | raw
// title_deed        → motiva/documents/title-deeds         | raw
// allocation        → motiva/documents/allocations         | raw
// survey            → motiva/documents/surveys             | raw
// kyc_id            → motiva/kyc/id-documents              | raw / image
// kyc_utility       → motiva/kyc/utility-bills             | raw / image
// kyc_photo         → motiva/kyc/passport-photos           | image
// update_photo      → motiva/updates/photos                | image
// video             → motiva/updates/videos                | video
// other             → motiva/other                         | raw
// ─────────────────────────────────────────────────────────────────────────────

export type UploadCategory =
  | 'receipt'
  | 'offer_letter'
  | 'title_deed'
  | 'allocation'
  | 'survey'
  | 'kyc_id'
  | 'kyc_utility'
  | 'kyc_photo'
  | 'update_photo'
  | 'video'
  | 'other';

interface FolderSpec {
  folder: string;
  resourceType: 'image' | 'video' | 'raw' | 'auto';
}

const FOLDER_MAP: Record<UploadCategory, FolderSpec> = {
  receipt:      { folder: 'documents/receipts',      resourceType: 'raw' },
  offer_letter: { folder: 'documents/offer-letters', resourceType: 'raw' },
  title_deed:   { folder: 'documents/title-deeds',   resourceType: 'raw' },
  allocation:   { folder: 'documents/allocations',   resourceType: 'raw' },
  survey:       { folder: 'documents/surveys',        resourceType: 'raw' },
  kyc_id:       { folder: 'kyc/id-documents',        resourceType: 'auto' },
  kyc_utility:  { folder: 'kyc/utility-bills',       resourceType: 'auto' },
  kyc_photo:    { folder: 'kyc/passport-photos',     resourceType: 'image' },
  update_photo: { folder: 'updates/photos',          resourceType: 'image' },
  video:        { folder: 'updates/videos',          resourceType: 'video' },
  other:        { folder: 'other',                   resourceType: 'raw' },
};

export interface UploadResult {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
}

@Injectable()
export class CloudinaryService {
  private readonly env: string;
  private readonly rootFolder: string;

  constructor(private config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key:    config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });

    this.env = config.get<string>('NODE_ENV', 'development');
    this.rootFolder = `motiva/${this.env}`;
  }

  // ── Upload a buffer (from Multer) ─────────────────────────────────────────
  async uploadBuffer(
    buffer: Buffer,
    category: UploadCategory,
    originalName?: string,
  ): Promise<UploadResult> {
    const spec = FOLDER_MAP[category];
    const folder = `${this.rootFolder}/${spec.folder}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: spec.resourceType,
          use_filename: true,
          unique_filename: true,
          // Tag with category for easy filtering in Cloudinary Media Library
          tags: [`motiva`, category, this.env],
          // Keep original filename as context
          context: originalName ? { original_name: originalName } : undefined,
          // PDF & multi-page docs: generate first-page preview
          ...(spec.resourceType === 'raw' ? { format: undefined } : {}),
        },
        (err: UploadApiErrorResponse, result: UploadApiResponse) => {
          if (err) return reject(new InternalServerErrorException(`Cloudinary error: ${err.message}`));
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            resourceType: result.resource_type,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
          });
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  // ── Generate a signed URL (time-limited access for subscribers) ───────────
  generateSignedUrl(
    publicId: string,
    resourceType: 'image' | 'video' | 'raw' = 'raw',
    expiresInSeconds = 3600,
  ): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true,
      sign_url: true,
      expires_at: expiresAt,
      type: 'authenticated',
    });
  }

  // ── Generate a plain secure URL (for public/immediate documents) ──────────
  secureUrl(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'raw'): string {
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true,
    });
  }

  // ── Delete a file ─────────────────────────────────────────────────────────
  async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'raw') {
    return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }

  // ── List files in a folder ────────────────────────────────────────────────
  async listFolder(category: UploadCategory, maxResults = 50) {
    const spec = FOLDER_MAP[category];
    const folder = `${this.rootFolder}/${spec.folder}`;
    return cloudinary.api.resources({
      type: 'upload',
      resource_type: spec.resourceType === 'auto' ? 'raw' : spec.resourceType,
      prefix: folder,
      max_results: maxResults,
    });
  }

  // ── Image transformation URL (for thumbnails, cover images, etc.) ─────────
  imageUrl(
    publicId: string,
    options: { width?: number; height?: number; crop?: string; quality?: string | number } = {},
  ): string {
    return cloudinary.url(publicId, {
      resource_type: 'image',
      secure: true,
      width: options.width,
      height: options.height,
      crop: options.crop ?? 'fill',
      quality: options.quality ?? 'auto',
      fetch_format: 'auto',
    });
  }
}
