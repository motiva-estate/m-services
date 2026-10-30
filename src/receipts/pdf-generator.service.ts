import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Receipt } from '../common/schemas/receipt.schema';
import { Client } from '../common/schemas/client.schema';
import * as QRCode from 'qrcode';
import * as PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PdfGeneratorService {
  constructor(private config: ConfigService) { }

  /**
   * Generate QR code as base64 data URL
   */
  async generateQRCode(receiptNumber: string): Promise<string> {
    const verificationUrl = `${this.config.get('FRONTEND_URL', 'http://localhost:3000')}/verify/${receiptNumber.replace(/\//g, '-')}`;
    return QRCode.toDataURL(verificationUrl, {
      width: 150,
      margin: 1,
    });
  }

  /**
   * Convert number to Nigerian Naira words
   */
  private numberToWords(num: number): string {
    if (num === 0) return 'Zero Naira Only';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = [
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const convert = (n: number): string => {
      if (n === 0) return '';
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) {
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return tens[ten] + (one > 0 ? ' ' + ones[one] : '');
      }
      if (n < 1000) {
        const hundred = Math.floor(n / 100);
        const rest = n % 100;
        return ones[hundred] + ' Hundred' + (rest > 0 ? ' and ' + convert(rest) : '');
      }
      if (n < 1000000) {
        const thousand = Math.floor(n / 1000);
        const rest = n % 1000;
        return (
          convert(thousand) + ' Thousand' + (rest > 0 ? (rest < 100 ? ' and ' : ', ') + convert(rest) : '')
        );
      }
      if (n < 1000000000) {
        const million = Math.floor(n / 1000000);
        const rest = n % 1000000;
        return (
          convert(million) +
          ' Million' +
          (rest > 0 ? (rest < 100 ? ' and ' : ', ') + convert(rest) : '')
        );
      }
      const billion = Math.floor(n / 1000000000);
      const rest = n % 1000000000;
      return (
        convert(billion) +
        ' Billion' +
        (rest > 0 ? (rest < 100 ? ' and ' : ', ') + convert(rest) : '')
      );
    };

    const nairaInt = Math.floor(num);
    const kobo = Math.round((num - nairaInt) * 100);

    let result = convert(nairaInt) + ' Naira';
    if (kobo > 0) {
      result += ', ' + convert(kobo) + ' Kobo';
    }
    return result + ' Only';
  }

  /**
   * Generate receipt PDF using PDFKit
   */
  async generateReceiptPDF(receipt: Receipt, client: Client): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Generate QR code
        const qrCode = await this.generateQRCode(receipt.receiptNumber);
        const qrBuffer = Buffer.from(qrCode.split(',')[1], 'base64');

        // Load logo
        const logoPath = path.join(__dirname, 'motiva-logo.png');
        let logoExists = false;
        try {
          logoExists = fs.existsSync(logoPath);
        } catch (e) {
          // Logo doesn't exist, continue without it
        }

        // Header with Logo (top left)
        let startY = 50;
        if (logoExists) {
          doc.image(logoPath, 50, startY, { width: 60, height: 60 });
          startY = 50; // Keep title aligned with logo
        }

        // Title next to logo
        doc
          .fontSize(28)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('RECEIPT', logoExists ? 120 : 50, startY, { align: 'left' });

        doc
          .fontSize(11)
          .font('Helvetica')
          .text('PAYMENT ACKNOWLEDGEMENT', logoExists ? 120 : 50, startY + 32, { align: 'left' });

        // Reset position after header
        doc.y = 120;

        // Receipt details box
        const leftCol = 50;
        const rightCol = 350;
        let yPos = doc.y;

        // Date Issued
        doc.fontSize(10).font('Helvetica-Bold').text('DATE ISSUED', leftCol, yPos);
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(receipt.dateIssued, leftCol, yPos + 15);

        // Receipt Number
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('RECEIPT NUMBER', rightCol, yPos);
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(receipt.receiptNumber, rightCol, yPos + 15);

        yPos += 50;
        doc.moveTo(leftCol, yPos).lineTo(545, yPos).stroke();
        yPos += 15;

        // Issued To
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('ISSUED TO', leftCol, yPos);
        yPos += 15;
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(client.fullName, leftCol, yPos);
        yPos += 15;
        if (client.phone) {
          doc.text(client.phone, leftCol, yPos);
          yPos += 15;
        }
        doc.text(client.email, leftCol, yPos);
        yPos += 30;

        doc.moveTo(leftCol, yPos).lineTo(545, yPos).stroke();
        yPos += 15;

        // Payment Description
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('PAYMENT DESCRIPTION', leftCol, yPos);
        yPos += 15;
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(receipt.paymentDescription, leftCol, yPos, { width: 300 });
        yPos += 40;

        // Amount Received
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('AMOUNT RECEIVED', leftCol, yPos);
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(`₦ ${receipt.amountReceived.toLocaleString()}`, leftCol, yPos + 15);
        yPos += 50;

        doc.moveTo(leftCol, yPos).lineTo(545, yPos).stroke();
        yPos += 15;

        // Payment Entries Table
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('NO.', leftCol, yPos, { width: 30 })
          .text('PAYMENT DATE', leftCol + 40, yPos, { width: 80 })
          .text('PAYMENT METHOD', leftCol + 130, yPos, { width: 200 })
          .text('AMOUNT (₦)', leftCol + 350, yPos, { width: 100, align: 'right' });

        yPos += 15;
        doc.moveTo(leftCol, yPos).lineTo(545, yPos).stroke();
        yPos += 10;

        // Payment entries
        receipt.paymentEntries.forEach((entry, index) => {
          const methodText = entry.bankName
            ? `${entry.paymentMethod} (${entry.bankName}${entry.accountNumber ? ' - ' + entry.accountNumber : ''})`
            : entry.paymentMethod;

          doc
            .fontSize(9)
            .font('Helvetica')
            .text((index + 1).toString(), leftCol, yPos, { width: 30 })
            .text(entry.paymentDate, leftCol + 40, yPos, { width: 80 })
            .text(methodText, leftCol + 130, yPos, { width: 200 })
            .text(entry.amount.toLocaleString(), leftCol + 350, yPos, { width: 100, align: 'right' });

          yPos += 20;
        });

        doc.moveTo(leftCol, yPos).lineTo(545, yPos).stroke();
        yPos += 10;

        // Total
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('TOTAL PAID', leftCol, yPos)
          .text(`₦ ${receipt.totalPaid.toLocaleString()}`, leftCol + 350, yPos, { width: 100, align: 'right' });

        yPos += 30;
        doc.moveTo(leftCol, yPos).lineTo(545, yPos).stroke();
        yPos += 15;

        // Amount in Words
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('AMOUNT IN WORDS', leftCol, yPos);
        yPos += 15;
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(receipt.amountInWords, leftCol, yPos, { width: 450 });

        yPos += 50;

        // Thank you section
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('THANK YOU!', leftCol, yPos);
        yPos += 15;
        doc
          .fontSize(9)
          .font('Helvetica')
          .text('PLEASURE DOING BUSINESS WITH YOU', leftCol, yPos);

        yPos += 30;
        doc.text('Finance Manager – Sign, Stamp & Date', leftCol, yPos);

        // QR Code (top right corner)
        doc.image(qrBuffer, 470, 50, { width: 80 });

        // VOID Watermark (if receipt is voided)
        if (receipt.status === 'VOIDED') {
          doc.save();
          doc
            .rotate(-45, { origin: [300, 400] })
            .fontSize(100)
            .font('Helvetica-Bold')
            .fillColor('#ff0000', 0.15)
            .text('VOID', 150, 350, {
              width: 400,
              align: 'center',
            });
          doc.restore();
        }

        // Footer - Disclaimer
        const footerY = 750;
        doc
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('DISCLAIMER', leftCol, footerY);
        doc
          .fontSize(7)
          .font('Helvetica')
          .text(
            'This receipt acknowledges the sum received as shown in the payment details above, based on the proof of payment forwarded to us. All payments are subject to confirmation by our accounts department, due to the nature of internet transaction failures, interruptions and malfunctions in payment systems.',
            leftCol,
            footerY + 10,
            { width: 495, lineGap: 2 },
          );

        // Company Info
        doc
          .fontSize(7)
          .font('Helvetica')
          .text(
            'Motiva  |  123 Estate Avenue, Abuja, Nigeria  |  www.motivaestate.com  |  info@motivaestate.com  |  +234 800 123 4567',
            leftCol,
            800,
            { align: 'center', width: 495 },
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get amount in words for a number
   */
  getAmountInWords(amount: number): string {
    return this.numberToWords(amount);
  }
}
