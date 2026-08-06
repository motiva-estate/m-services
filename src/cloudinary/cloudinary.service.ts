import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from "cloudinary";
import * as streamifier from "streamifier";

// ─── Folder routing map ───────────────────────────────────────────────────────
// Every upload lands in:  motiva/<environment>/<folder>
//
// Category          → Cloudinary folder                   | Resource type
// ------------------+--------------------------------------|--------------
// receipt           → motiva/documents/receipts            | auto
// offer_letter      → motiva/documents/offer-letters       | auto
// title_deed        → motiva/documents/title-deeds         | auto
// allocation        → motiva/documents/allocations         | auto
// survey            → motiva/documents/surveys             | auto
// kyc_id            → motiva/kyc/id-documents              | auto
// kyc_utility       → motiva/kyc/utility-bills             | auto
// kyc_photo         → motiva/kyc/passport-photos           | image
// update_photo      → motiva/updates/photos                | image
// video             → motiva/updates/videos                | video
// other             → motiva/other                         | auto
//
// ALL document and KYC categories use resource_type 'auto' so Cloudinary
// inspects the file's magic bytes.  Photo categories use 'image' explicitly
// to unlock transformation support.
// ─────────────────────────────────────────────────────────────────────────────

export type UploadCategory =
  | "receipt"
  | "offer_letter"
  | "title_deed"
  | "allocation"
  | "survey"
  | "kyc_id"
  | "kyc_utility"
  | "kyc_photo"
  | "update_photo"
  | "video"
  | "other";

interface FolderSpec {
  folder: string;
  resourceType: "image" | "video" | "auto";
}

const FOLDER_MAP: Record<UploadCategory, FolderSpec> = {
  receipt: { folder: "documents/receipts", resourceType: "auto" },
  offer_letter: { folder: "documents/offer-letters", resourceType: "auto" },
  title_deed: { folder: "documents/title-deeds", resourceType: "auto" },
  allocation: { folder: "documents/allocations", resourceType: "auto" },
  survey: { folder: "documents/surveys", resourceType: "auto" },
  kyc_id: { folder: "kyc/id-documents", resourceType: "auto" },
  kyc_utility: { folder: "kyc/utility-bills", resourceType: "auto" },
  kyc_photo: { folder: "kyc/passport-photos", resourceType: "image" },
  update_photo: { folder: "updates/photos", resourceType: "image" },
  video: { folder: "updates/videos", resourceType: "video" },
  other: { folder: "other", resourceType: "auto" },
};

// ── MIME type classification ──────────────────────────────────────────────────

/** MIMEs that should be uploaded as resource_type 'raw' (documents, spreadsheets). */
const RAW_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

/** Returns true for MIMEs that Cloudinary should treat as raw files (not image/video). */
function isRawMime(mime?: string): boolean {
  if (!mime) return false;
  return RAW_MIME_TYPES.has(mime.toLowerCase());
}

// ── MIME → Cloudinary format hint ────────────────────────────────────────────
// Only return a format hint for image and video types.
// For document types (PDF, DOCX, CSV, etc.) we must NOT pass format — doing
// so causes Cloudinary to incorrectly classify the file as an image variant
// (e.g. image/pdf) rather than as a raw document.
function mimeToFormat(mime?: string): string | undefined {
  if (!mime) return undefined;
  if (isRawMime(mime)) return undefined; // never hint format for documents

  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/tiff": "tiff",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
    "video/webm": "webm",
  };
  return map[mime.toLowerCase()];
}

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
      cloud_name: config.get<string>("CLOUDINARY_CLOUD_NAME"),
      api_key: config.get<string>("CLOUDINARY_API_KEY"),
      api_secret: config.get<string>("CLOUDINARY_API_SECRET"),
      secure: true,
    });

    this.env = config.get<string>("NODE_ENV", "development");
    this.rootFolder = `motiva/${this.env}`;
  }

  // ── Upload a buffer (from Multer) ─────────────────────────────────────────
  // mimetype — forward file.mimetype from Multer so Cloudinary receives an
  //            explicit type hint alongside the raw bytes.
  async uploadBuffer(
    buffer: Buffer,
    category: UploadCategory,
    originalName?: string,
    mimetype?: string,
  ): Promise<UploadResult> {
    const spec = FOLDER_MAP[category];
    const folder = `${this.rootFolder}/${spec.folder}`;
    const formatHint = mimeToFormat(mimetype);

    // For known document MIME types, always force resource_type to 'raw'
    // regardless of what the FOLDER_MAP says. 'auto' with a document MIME can
    // cause Cloudinary to misclassify the file as an image variant.
    const resourceType: "image" | "video" | "raw" | "auto" =
      mimetype && isRawMime(mimetype) ? "raw" : spec.resourceType;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          use_filename: true,
          unique_filename: true,
          tags: ["motiva", category, this.env],
          context: originalName ? { original_name: originalName } : undefined,
          // Only set format when we have a confirmed image/video hint.
          ...(formatHint ? { format: formatHint } : {}),
        },
        (err: UploadApiErrorResponse, result: UploadApiResponse) => {
          if (err) {
            return reject(
              new InternalServerErrorException(`Cloudinary upload error: ${err.message}`),
            );
          }
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
    resourceType: "image" | "video" | "raw" = "raw",
    expiresInSeconds = 3600,
  ): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true,
      sign_url: true,
      expires_at: expiresAt,
      type: "authenticated",
    });
  }

  // ── Generate a plain secure URL (for public/immediate documents) ──────────
  secureUrl(publicId: string, resourceType: "image" | "video" | "raw" = "raw"): string {
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true,
    });
  }

  // ── Delete a file ─────────────────────────────────────────────────────────
  async deleteFile(publicId: string, resourceType: "image" | "video" | "raw" = "raw") {
    return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }

  // ── List files in a folder ────────────────────────────────────────────────
  async listFolder(category: UploadCategory, maxResults = 50) {
    const spec = FOLDER_MAP[category];
    const folder = `${this.rootFolder}/${spec.folder}`;
    // Document categories are stored as 'raw'; image categories as 'image'.
    const resourceType =
      spec.resourceType === "image" ? "image" : spec.resourceType === "video" ? "video" : "raw";
    return cloudinary.api.resources({
      type: "upload",
      resource_type: resourceType,
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
      resource_type: "image",
      secure: true,
      width: options.width,
      height: options.height,
      crop: options.crop ?? "fill",
      quality: options.quality ?? "auto",
      fetch_format: "auto",
    });
  }
}
