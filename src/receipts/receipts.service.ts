import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Receipt, ReceiptDocument } from "../common/schemas/receipt.schema";
import { Client, ClientDocument } from "../common/schemas/client.schema";
import { CreateReceiptDto, UpdateReceiptDto } from "./dto/create-receipt.dto";
import { PdfGeneratorService } from "./pdf-generator.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectModel(Receipt.name) private receiptModel: Model<ReceiptDocument>,
    @InjectModel(Client.name) private clientModel: Model<ClientDocument>,
    private pdfGenerator: PdfGeneratorService,
    private cloudinary: CloudinaryService,
  ) {}

  /**
   * Generate receipt number in format MTV/YYYY/####
   */
  private async generateReceiptNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MTV/${year}/`;

    // Find the last receipt for this year
    const lastReceipt = await this.receiptModel
      .findOne({ receiptNumber: new RegExp(`^${prefix}`) })
      .sort({ receiptNumber: -1 })
      .exec();

    let nextNumber = 1;
    if (lastReceipt) {
      const lastNumber = parseInt(lastReceipt.receiptNumber.split("/")[2], 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(4, "0")}`;
  }

  /**
   * Create a new receipt
   */
  async create(dto: CreateReceiptDto, userId: string, userName: string): Promise<Receipt> {
    // Verify client exists
    const client = await this.clientModel.findById(dto.clientId).exec();
    if (!client) {
      throw new NotFoundException(`Client with ID ${dto.clientId} not found`);
    }

    // Calculate total paid from payment entries
    const totalPaid = dto.paymentEntries.reduce((sum, entry) => sum + entry.amount, 0);

    // Validate total matches amount received
    if (Math.abs(totalPaid - dto.amountReceived) > 0.01) {
      throw new BadRequestException(
        `Total of payment entries (${totalPaid}) does not match amount received (${dto.amountReceived})`,
      );
    }

    // Generate receipt number
    const receiptNumber = await this.generateReceiptNumber();

    // Convert amount to words
    const amountInWords = this.pdfGenerator.getAmountInWords(dto.amountReceived);

    // Generate QR code
    const qrCodeData = await this.pdfGenerator.generateQRCode(receiptNumber);

    // Create receipt
    const receipt = new this.receiptModel({
      receiptNumber,
      dateIssued: dto.dateIssued,
      clientId: dto.clientId,
      paymentDescription: dto.paymentDescription,
      amountReceived: dto.amountReceived,
      paymentEntries: dto.paymentEntries,
      totalPaid,
      amountInWords,
      qrCodeData,
      status: dto.status || "DRAFT",
      issuedByUserId: userId,
      issuedByUserName: userName,
      // company / sign-off (optional)
      ...(dto.companyAddress !== undefined && { companyAddress: dto.companyAddress }),
      ...(dto.companyWebsite !== undefined && { companyWebsite: dto.companyWebsite }),
      ...(dto.companyEmail !== undefined && { companyEmail: dto.companyEmail }),
      ...(dto.companyPhone !== undefined && { companyPhone: dto.companyPhone }),
      ...(dto.signatory !== undefined && { signatory: dto.signatory }),
      ...(dto.signatureImage !== undefined && { signatureImage: dto.signatureImage }),
      ...(dto.disclaimer !== undefined && { disclaimer: dto.disclaimer }),
    });

    return receipt.save();
  }

  /**
   * List all receipts with pagination
   */
  async list(
    page = 1,
    limit = 20,
    filters?: {
      clientId?: string;
      status?: string;
      search?: string;
    },
  ): Promise<{ data: Receipt[]; total: number; page: number; limit: number }> {
    const query: any = {};

    if (filters?.clientId) {
      query.clientId = filters.clientId;
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.search) {
      query.receiptNumber = new RegExp(filters.search, "i");
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.receiptModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.receiptModel.countDocuments(query),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Get a single receipt by ID
   */
  async get(id: string): Promise<Receipt> {
    const receipt = await this.receiptModel.findById(id).exec();
    if (!receipt) {
      throw new NotFoundException(`Receipt with ID ${id} not found`);
    }
    return receipt;
  }

  /**
   * Get receipt by receipt number (for public verification)
   */
  async getByReceiptNumber(receiptNumber: string): Promise<Receipt> {
    // Handle URL-safe format (MTV-2026-0001)
    const normalized = receiptNumber.replace(/-/g, "/");
    const receipt = await this.receiptModel.findOne({ receiptNumber: normalized }).exec();
    if (!receipt) {
      throw new NotFoundException(`Receipt ${receiptNumber} not found`);
    }
    return receipt;
  }

  /**
   * Get receipts by client ID
   */
  async getByClient(clientId: string): Promise<Receipt[]> {
    return this.receiptModel.find({ clientId }).sort({ dateIssued: -1 }).exec();
  }

  /**
   * Update a receipt
   */
  async update(id: string, dto: UpdateReceiptDto): Promise<Receipt> {
    const receipt = await this.receiptModel.findById(id).exec();
    if (!receipt) {
      throw new NotFoundException(`Receipt with ID ${id} not found`);
    }

    // Recalculate if payment entries changed
    if (dto.paymentEntries) {
      const totalPaid = dto.paymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
      receipt.totalPaid = totalPaid;

      if (dto.amountReceived && Math.abs(totalPaid - dto.amountReceived) > 0.01) {
        throw new BadRequestException(
          `Total of payment entries (${totalPaid}) does not match amount received (${dto.amountReceived})`,
        );
      }

      receipt.paymentEntries = dto.paymentEntries as any;
    }

    if (dto.dateIssued) receipt.dateIssued = dto.dateIssued;
    if (dto.paymentDescription) receipt.paymentDescription = dto.paymentDescription;
    if (dto.amountReceived) {
      receipt.amountReceived = dto.amountReceived;
      receipt.amountInWords = this.pdfGenerator.getAmountInWords(dto.amountReceived);
    }
    if (dto.status) receipt.status = dto.status;
    // company / sign-off — allow explicit empty string to clear a field
    if (dto.companyAddress !== undefined) receipt.companyAddress = dto.companyAddress;
    if (dto.companyWebsite !== undefined) receipt.companyWebsite = dto.companyWebsite;
    if (dto.companyEmail !== undefined) receipt.companyEmail = dto.companyEmail;
    if (dto.companyPhone !== undefined) receipt.companyPhone = dto.companyPhone;
    if (dto.signatory !== undefined) receipt.signatory = dto.signatory;
    if (dto.signatureImage !== undefined) receipt.signatureImage = dto.signatureImage;
    if (dto.disclaimer !== undefined) receipt.disclaimer = dto.disclaimer;

    return receipt.save();
  }

  /**
   * Delete a receipt
   */
  async delete(id: string): Promise<void> {
    const result = await this.receiptModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Receipt with ID ${id} not found`);
    }
  }

  /**
   * Void a receipt (soft delete with audit trail)
   */
  async void(id: string, reason: string, userId: string, userName: string): Promise<Receipt> {
    const receipt = await this.receiptModel.findById(id).exec();
    if (!receipt) {
      throw new NotFoundException(`Receipt with ID ${id} not found`);
    }

    if (receipt.status === "VOIDED") {
      throw new BadRequestException("Receipt is already voided");
    }

    if (receipt.status === "DRAFT") {
      throw new BadRequestException("Cannot void a draft receipt. Please delete it instead.");
    }

    const updated = await this.receiptModel
      .findByIdAndUpdate(
        id,
        {
          status: "VOIDED",
          voidedAt: new Date(),
          voidedByUserId: userId,
          voidedByUserName: userName,
          voidReason: reason,
        },
        { new: true },
      )
      .exec();

    return updated;
  }

  /**
   * Generate PDF for a receipt
   */
  async generatePDF(id: string): Promise<{ url: string; buffer: Buffer }> {
    const receipt = await this.get(id);
    const client = await this.clientModel.findById(receipt.clientId).exec();

    if (!client) {
      throw new NotFoundException(`Client for receipt not found`);
    }

    // Generate PDF
    const pdfBuffer = await this.pdfGenerator.generateReceiptPDF(receipt, client);

    // Upload to Cloudinary
    const uploadResult = await this.cloudinary.uploadBuffer(
      pdfBuffer,
      "receipt",
      `${receipt.receiptNumber.replace(/\//g, "-")}.pdf`,
      "application/pdf",
    );

    // Update receipt with PDF URL
    const updatedReceipt = await this.receiptModel
      .findByIdAndUpdate(id, { pdfUrl: uploadResult.secureUrl }, { new: true })
      .exec();

    return {
      url: uploadResult.secureUrl,
      buffer: pdfBuffer,
    };
  }

  /**
   * Get receipt with client data (for display/PDF generation)
   */
  async getReceiptWithClient(id: string): Promise<{ receipt: Receipt; client: Client }> {
    const receipt = await this.get(id);
    const client = await this.clientModel.findById(receipt.clientId).exec();

    if (!client) {
      throw new NotFoundException(`Client for receipt not found`);
    }

    return { receipt, client };
  }

  /**
   * Get receipt by receipt number with client data (for verification page)
   */
  async getReceiptWithClientByNumber(
    receiptNumber: string,
  ): Promise<{ receipt: Receipt; client: Client }> {
    const receipt = await this.getByReceiptNumber(receiptNumber);
    const client = await this.clientModel.findById(receipt.clientId).exec();

    if (!client) {
      throw new NotFoundException(`Client for receipt not found`);
    }

    return { receipt, client };
  }
}
