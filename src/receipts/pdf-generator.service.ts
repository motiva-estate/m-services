import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Receipt } from "../common/schemas/receipt.schema";
import { Client } from "../common/schemas/client.schema";
import * as QRCode from "qrcode";
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";

const C = {
  navy: "#353046",
  gold: "#D6C29A",
  stripe: "#F2EFE7",
  text: "#4A4558",
  white: "#FFFFFF",
};

// Page geometry (A4 = 595.28 x 841.89 pt)
const PAGE_W = 595.28;
const X = 71; // content left
const W = 457; // content width
const R = X + W; // content right

@Injectable()
export class PdfGeneratorService {
  constructor(private config: ConfigService) {}

  /**
   * Generate QR code as base64 data URL (navy on white to match the design)
   */
  async generateQRCode(receiptNumber: string): Promise<string> {
    const verificationUrl = `${this.config.get("FRONTEND_URL", "http://localhost:3000")}/verify/${receiptNumber.replace(/\//g, "-")}`;
    return QRCode.toDataURL(verificationUrl, {
      width: 300,
      margin: 1,
      color: { dark: C.navy, light: "#FFFFFF" },
    });
  }

  /**
   * Convert number to Nigerian Naira words
   */
  private numberToWords(num: number): string {
    if (num === 0) return "Zero Naira Only";

    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = [
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];
    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const convert = (n: number): string => {
      if (n === 0) return "";
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) {
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return tens[ten] + (one > 0 ? " " + ones[one] : "");
      }
      if (n < 1000) {
        const hundred = Math.floor(n / 100);
        const rest = n % 100;
        return ones[hundred] + " Hundred" + (rest > 0 ? " and " + convert(rest) : "");
      }
      if (n < 1000000) {
        const thousand = Math.floor(n / 1000);
        const rest = n % 1000;
        return (
          convert(thousand) +
          " Thousand" +
          (rest > 0 ? (rest < 100 ? " and " : ", ") + convert(rest) : "")
        );
      }
      if (n < 1000000000) {
        const million = Math.floor(n / 1000000);
        const rest = n % 1000000;
        return (
          convert(million) +
          " Million" +
          (rest > 0 ? (rest < 100 ? " and " : ", ") + convert(rest) : "")
        );
      }
      const billion = Math.floor(n / 1000000000);
      const rest = n % 1000000000;
      return (
        convert(billion) +
        " Billion" +
        (rest > 0 ? (rest < 100 ? " and " : ", ") + convert(rest) : "")
      );
    };

    const nairaInt = Math.floor(num);
    const kobo = Math.round((num - nairaInt) * 100);

    let result = convert(nairaInt) + " Naira";
    if (kobo > 0) {
      result += ", " + convert(kobo) + " Kobo";
    }
    return result + " Only";
  }

  private fmt(n: number): string {
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Generate receipt PDF using PDFKit (Motiva Receipt Studio design)
   */
  async generateReceiptPDF(receipt: Receipt, client: Client): Promise<Buffer> {
    const qrCode = await this.generateQRCode(receipt.receiptNumber);
    const qrBuffer = Buffer.from(qrCode.split(",")[1], "base64");

    return new Promise((resolve, reject) => {
      try {
        // margins 0 -> we position everything absolutely and avoid PDFKit auto page breaks
        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        // ---------- Fonts ----------
        // Helvetica (built-in) cannot render the Naira sign, which is why it printed as "¦".
        // Drop static Inter-Regular.ttf / Inter-Bold.ttf (or any Unicode font that has U+20A6) in ./fonts
        const fontsDir = path.join(__dirname, "fonts");
        const regularPath = path.join(fontsDir, "Inter-Regular.ttf");
        const boldPath = path.join(fontsDir, "Inter-Bold.ttf");
        let FONT = "Helvetica";
        let FONT_BOLD = "Helvetica-Bold";
        let naira = "NGN ";
        if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
          doc.registerFont("Body", regularPath);
          doc.registerFont("BodyBold", boldPath);
          FONT = "Body";
          FONT_BOLD = "BodyBold";
          naira = "₦";
        }

        const label = (text: string, x: number, y: number, color: string, opts: any = {}) =>
          doc
            .font(FONT_BOLD)
            .fontSize(7)
            .fillColor(color)
            .text(text, x, y, { characterSpacing: 1.6, lineBreak: false, ...opts });

        // ---------- Header ----------
        doc.rect(28, 28, PAGE_W - 56, 166).fill(C.navy);
        doc.rect(28, 28, PAGE_W - 56, 5).fill(C.gold);

        // Decorative translucent shapes
        doc.save();
        doc.fillOpacity(0.05).fillColor(C.white);
        doc.polygon([385, 33], [462, 33], [462, 105], [385, 80]).fill();
        doc.polygon([474, 33], [567, 33], [567, 118], [474, 92]).fill();
        doc.restore();

        // Logo (use a light/gold version for the navy header)
        const logoCandidates = ["motiva-logo-light.png", "motiva-logo.png"].map((f) =>
          path.join(__dirname, f),
        );
        const logoPath = logoCandidates.find((p) => fs.existsSync(p));
        if (logoPath) {
          doc.image(logoPath, X, 52, { fit: [110, 50] });
        } else {
          doc
            .font(FONT_BOLD)
            .fontSize(26)
            .fillColor(C.gold)
            .text("Motiva", X, 60, { lineBreak: false });
        }

        // Title
        doc
          .font(FONT_BOLD)
          .fontSize(40)
          .fillColor(C.white)
          .text("RECEIPT", X, 116, { characterSpacing: 2, lineBreak: false });
        label("PAYMENT ACKNOWLEDGEMENT", X, 166, C.gold, { characterSpacing: 2.4, fontSize: 6.5 });

        // Right column: date, number, issued to
        const RX = 360;
        label("DATE ISSUED", RX, 58, C.gold);
        doc
          .font(FONT_BOLD)
          .fontSize(9)
          .fillColor(C.white)
          .text(receipt.dateIssued, RX, 70, { lineBreak: false });

        label("RECEIPT NUMBER", RX, 88, C.gold);
        doc
          .font(FONT_BOLD)
          .fontSize(9)
          .fillColor(C.white)
          .text(`#${receipt.receiptNumber}`, RX, 100, { lineBreak: false });

        label("ISSUED TO", RX, 118, C.gold);
        doc
          .font(FONT_BOLD)
          .fontSize(9)
          .fillColor(C.white)
          .text(client.fullName, RX, 130, { width: 200, lineBreak: false, ellipsis: true });
        let iy = 143;
        doc.font(FONT).fontSize(8).fillColor(C.white);
        if (client.phone) {
          doc.text(client.phone, RX, iy, { width: 200, lineBreak: false });
          iy += 11;
        }
        doc.text(client.email, RX, iy, { width: 200, lineBreak: false, ellipsis: true });

        // Curved white transition under the header
        doc.save();
        doc
          .moveTo(55, 205)
          .lineTo(55, 194)
          .quadraticCurveTo(55, 178, 75, 178)
          .lineTo(520, 178)
          .quadraticCurveTo(540, 178, 540, 194)
          .lineTo(540, 205)
          .lineTo(55, 205)
          .fill(C.white);
        doc
          .moveTo(55, 205)
          .lineTo(55, 194)
          .quadraticCurveTo(55, 178, 75, 178)
          .lineTo(520, 178)
          .quadraticCurveTo(540, 178, 540, 194)
          .lineTo(540, 205)
          .lineWidth(2)
          .strokeColor(C.gold)
          .stroke();
        doc.restore();

        // ---------- Payment description + amount box ----------
        label("PAYMENT DESCRIPTION", X, 228, C.navy);
        doc
          .font(FONT)
          .fontSize(9.5)
          .fillColor(C.text)
          .text(receipt.paymentDescription, X, 246, { width: 250 });

        doc.rect(343, 222, R - 343, 60).fill(C.gold);
        label("AMOUNT RECEIVED", 357, 234, C.navy);
        doc
          .font(FONT_BOLD)
          .fontSize(18)
          .fillColor(C.navy)
          .text(`${naira}${this.fmt(receipt.amountReceived)}`, 357, 250, { lineBreak: false });

        // ---------- Payment table ----------
        let y = 304;
        const colNo = X + 14;
        const colDate = X + 70;
        const colMethod = X + 165;
        const amtX = R - 114;
        const amtW = 100;

        const drawTableHeader = () => {
          doc.rect(X, y, W, 25).fill(C.navy);
          doc.font(FONT_BOLD).fontSize(7).fillColor(C.white);
          doc.text("NO.", colNo, y + 9, { lineBreak: false });
          doc.text("PAYMENT DATE", colDate, y + 9, { lineBreak: false });
          doc.text("PAYMENT METHOD", colMethod, y + 9, { lineBreak: false });
          doc.text(`AMOUNT (${naira.trim() === "₦" ? "₦" : "NGN"})`, amtX, y + 9, {
            width: amtW,
            align: "right",
            lineBreak: false,
          });
          y += 25;
        };

        drawTableHeader();

        receipt.paymentEntries.forEach((entry, index) => {
          // Start a continuation page if the table runs long
          if (y > 640) {
            doc.addPage();
            y = 50;
            drawTableHeader();
          }

          const rowH = 24;
          if (index % 2 === 1) doc.rect(X, y, W, rowH).fill(C.stripe);

          const methodText = entry.bankName
            ? `${entry.paymentMethod} (${entry.bankName}${entry.accountNumber ? " – " + entry.accountNumber : ""})`
            : entry.paymentMethod;

          doc.font(FONT).fontSize(8).fillColor(C.text);
          doc.text(String(index + 1), colNo, y + 8, { lineBreak: false });
          doc.text(entry.paymentDate, colDate, y + 8, { lineBreak: false });
          doc.text(methodText, colMethod, y + 8, { width: 190, lineBreak: false, ellipsis: true });
          doc.text(this.fmt(entry.amount), amtX, y + 8, {
            width: amtW,
            align: "right",
            lineBreak: false,
          });
          y += rowH;
        });

        // Total bar
        doc.rect(X, y, W, 26).fill(C.navy);
        doc.rect(R - 101, y, 101, 26).fill(C.gold);
        doc
          .font(FONT_BOLD)
          .fontSize(8)
          .fillColor(C.white)
          .text("TOTAL PAID", X, y + 9, {
            width: W - 101 - 14,
            align: "right",
            characterSpacing: 2,
            lineBreak: false,
          });
        doc
          .font(FONT_BOLD)
          .fontSize(8)
          .fillColor(C.navy)
          .text(`${naira}${this.fmt(receipt.totalPaid)}`, R - 101, y + 9, {
            width: 101 - 12,
            align: "right",
            lineBreak: false,
          });
        y += 26;

        // ---------- Amount in words ----------
        y += 20;
        label("AMOUNT IN WORDS", X, y, C.navy, { characterSpacing: 2 });
        y += 16;
        doc
          .font(FONT_BOLD)
          .fontSize(9)
          .fillColor(C.text)
          .text(receipt.amountInWords, X, y, { width: W });

        // ---------- Thank you / signature / QR ----------
        const blockY = Math.max(y + 60, 575);

        doc
          .font(FONT_BOLD)
          .fontSize(22)
          .fillColor(C.navy)
          .text("THANK YOU!", X, blockY + 22, { lineBreak: false });
        label("PLEASURE DOING BUSINESS WITH YOU", X, blockY + 52, C.navy, {
          fontSize: 6.5,
          characterSpacing: 1.4,
        });

        // Signature line + caption
        doc
          .moveTo(256, blockY + 70)
          .lineTo(430, blockY + 70)
          .lineWidth(1)
          .strokeColor(C.navy)
          .stroke();
        doc
          .font(FONT_BOLD)
          .fontSize(6.5)
          .fillColor(C.text)
          .text("Finance Manager", 256, blockY + 76, { continued: true, lineBreak: false })
          .font(FONT)
          .text(" — Sign, Stamp & Date", { lineBreak: false });

        // QR
        doc.image(qrBuffer, 448, blockY, { width: 73 });
        label("SCAN TO VERIFY", 448, blockY + 80, C.navy, {
          width: 73,
          align: "center",
          fontSize: 5.5,
          characterSpacing: 1,
        });

        // ---------- Disclaimer ----------
        const discY = 683;
        doc.moveTo(X, discY).lineTo(R, discY).lineWidth(1).strokeColor(C.gold).stroke();
        label("DISCLAIMER", X, discY + 9, C.navy, { fontSize: 6, characterSpacing: 2 });
        doc
          .font(FONT)
          .fontSize(6.5)
          .fillColor(C.text)
          .text(
            "This receipt acknowledges the sum received as shown in the payment details above, based on proof of payment forwarded to us. All payments remain subject to confirmation by our accounts department due to the nature of electronic transaction failures and interruptions.",
            X,
            discY + 21,
            { width: W, lineGap: 2 },
          );

        // ---------- Footer ----------
        const footY = 750;
        doc.moveTo(X, footY).lineTo(R, footY).lineWidth(1).strokeColor(C.gold).stroke();
        doc
          .font(FONT)
          .fontSize(6.5)
          .fillColor(C.text)
          .text(
            "Motiva  |  123 Estate Avenue, Abuja, Nigeria  |  www.motivaestate.com  |  info@motivaestate.com  |  +234 800 123 4567",
            X,
            footY + 12,
            { width: W, align: "center", lineBreak: false },
          );

        // ---------- VOID watermark ----------
        if (receipt.status === "VOIDED") {
          doc.save();
          doc
            .rotate(-45, { origin: [300, 420] })
            .font(FONT_BOLD)
            .fontSize(100)
            .fillColor("#ff0000")
            .fillOpacity(0.15)
            .text("VOID", 150, 370, { width: 400, align: "center", lineBreak: false });
          doc.restore();
        }

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
