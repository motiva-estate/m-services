import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ReceiptDocument = Receipt & Document;

export type ReceiptStatus = "DRAFT" | "ISSUED" | "VOIDED";

@Schema({ _id: false })
class PaymentEntry {
  @Prop({ required: true })
  paymentDate: string;

  @Prop({ required: true })
  paymentMethod: string; // "Bank Transfer", "Cash", "POS", "Cheque"

  @Prop()
  bankName?: string;

  @Prop()
  accountNumber?: string;

  @Prop({ required: true })
  amount: number;
}

@Schema({ timestamps: true, collection: "receipts" })
export class Receipt {
  @Prop({ required: true, unique: true })
  receiptNumber: string; // "MTV/2026/0001"

  @Prop({ required: true })
  dateIssued: string; // "DD-MM-YYYY"

  @Prop({ required: true })
  clientId: string;

  @Prop({ required: true })
  paymentDescription: string;

  @Prop({ required: true })
  amountReceived: number;

  @Prop({ type: [PaymentEntry], default: [] })
  paymentEntries: PaymentEntry[];

  @Prop({ required: true })
  totalPaid: number;

  @Prop({ required: true })
  amountInWords: string;

  @Prop()
  qrCodeData?: string; // Base64 QR code image data

  @Prop()
  pdfUrl?: string; // Cloudinary URL to generated PDF

  @Prop({
    type: String,
    enum: ["DRAFT", "ISSUED", "VOIDED"],
    default: "DRAFT",
  })
  status: ReceiptStatus;

  // ── Company / sign-off (optional, per-receipt overrides) ──────────────────
  @Prop()
  companyAddress?: string;

  @Prop()
  companyWebsite?: string;

  @Prop()
  companyEmail?: string;

  @Prop()
  companyPhone?: string;

  /** Name printed on the signature line (default: "Finance Manager"). */
  @Prop()
  signatory?: string;

  /**
   * Base64 data URL of the uploaded signature / stamp image.
   * Stored as a string; PDF generator decodes it directly.
   */
  @Prop()
  signatureImage?: string;

  /** Custom disclaimer text (overrides the hardcoded default). */
  @Prop()
  disclaimer?: string;

  // ── Audit ──────────────────────────────────────────────────────────────────
  @Prop()
  issuedByUserId?: string;

  @Prop()
  issuedByUserName?: string;

  @Prop()
  voidedAt?: Date;

  @Prop()
  voidedByUserId?: string;

  @Prop()
  voidedByUserName?: string;

  @Prop()
  voidReason?: string;
}

export const ReceiptSchema = SchemaFactory.createForClass(Receipt);

// Indexes
// NOTE: receiptNumber is already indexed by `unique: true` on the @Prop above.
// Declaring it again here triggers a Mongoose "Duplicate schema index" warning.
ReceiptSchema.index({ clientId: 1 });
ReceiptSchema.index({ dateIssued: -1 });
ReceiptSchema.index({ status: 1 });
