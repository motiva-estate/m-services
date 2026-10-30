import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Receipt } from "../common/schemas/receipt.schema";
import { Client } from "../common/schemas/client.schema";
import * as QRCode from "qrcode";
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";

// ── Design tokens (match the React preview exactly) ──────────────────────────
const C = {
  navy: "#353046",
  gold: "#D6C29A",
  stripe: "#F2EFE7",
  text: "#4A4558",
  white: "#FFFFFF",
};

// Page geometry — A4 = 595.28 × 841.89 pt
const PAGE_W = 595.28;
const X = 56; // content left margin (matches header padding)
const W = PAGE_W - X * 2; // content width
const R = X + W; // content right edge

const DEFAULT_DISCLAIMER =
  "This receipt acknowledges the sum received as shown in the payment details above, " +
  "based on proof of payment forwarded to us. All payments remain subject to confirmation " +
  "by our accounts department due to the nature of electronic transaction failures and interruptions.";

@Injectable()
export class PdfGeneratorService {
  constructor(private config: ConfigService) {}

  // ── QR code ────────────────────────────────────────────────────────────────

  async generateQRCode(receiptNumber: string): Promise<string> {
    const verificationUrl = `${this.config.get("FRONTEND_URL", "http://localhost:3000")}/verify/${receiptNumber.replace(/\//g, "-")}`;
    return QRCode.toDataURL(verificationUrl, {
      width: 300,
      margin: 1,
      color: { dark: C.navy, light: "#FFFFFF" },
    });
  }

  // ── Amount in words ────────────────────────────────────────────────────────

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
        const t = Math.floor(n / 10);
        const o = n % 10;
        return tens[t] + (o > 0 ? " " + ones[o] : "");
      }
      if (n < 1000) {
        const h = Math.floor(n / 100);
        const rest = n % 100;
        return ones[h] + " Hundred" + (rest > 0 ? " and " + convert(rest) : "");
      }
      if (n < 1_000_000) {
        const th = Math.floor(n / 1000);
        const rest = n % 1000;
        return (
          convert(th) +
          " Thousand" +
          (rest > 0 ? (rest < 100 ? " and " : ", ") + convert(rest) : "")
        );
      }
      if (n < 1_000_000_000) {
        const m = Math.floor(n / 1_000_000);
        const rest = n % 1_000_000;
        return (
          convert(m) + " Million" + (rest > 0 ? (rest < 100 ? " and " : ", ") + convert(rest) : "")
        );
      }
      const b = Math.floor(n / 1_000_000_000);
      const rest = n % 1_000_000_000;
      return (
        convert(b) + " Billion" + (rest > 0 ? (rest < 100 ? " and " : ", ") + convert(rest) : "")
      );
    };

    const nairaInt = Math.floor(num);
    const kobo = Math.round((num - nairaInt) * 100);
    let result = convert(nairaInt) + " Naira";
    if (kobo > 0) result += ", " + convert(kobo) + " Kobo";
    return result + " Only";
  }

  getAmountInWords(amount: number): string {
    return this.numberToWords(amount);
  }

  private fmt(n: number): string {
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ── PDF generation ─────────────────────────────────────────────────────────

  async generateReceiptPDF(receipt: Receipt, client: Client): Promise<Buffer> {
    const qrCode = await this.generateQRCode(receipt.receiptNumber);
    const qrBuffer = Buffer.from(qrCode.split(",")[1], "base64");

    // Signature image (base64 data URL stored on the receipt)
    let sigBuffer: Buffer | null = null;
    if (receipt.signatureImage) {
      try {
        const b64 = receipt.signatureImage.split(",")[1] ?? receipt.signatureImage;
        sigBuffer = Buffer.from(b64, "base64");
      } catch {
        sigBuffer = null;
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        // ── Fonts ──────────────────────────────────────────────────────────
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

        const label = (
          text: string,
          x: number,
          y: number,
          color: string,
          opts: Record<string, unknown> = {},
        ) =>
          doc
            .font(FONT_BOLD)
            .fontSize(7)
            .fillColor(color)
            .text(text, x, y, { characterSpacing: 1.6, lineBreak: false, ...opts });

        // ── Header background ──────────────────────────────────────────────
        doc.rect(28, 28, PAGE_W - 56, 166).fill(C.navy);
        // Gold top accent bar
        doc.rect(28, 28, PAGE_W - 56, 5).fill(C.gold);

        // Subtle decorative shapes
        doc.save();
        doc.fillOpacity(0.05).fillColor(C.white);
        doc.polygon([385, 33], [462, 33], [462, 105], [385, 80]).fill();
        doc.polygon([474, 33], [567, 33], [567, 118], [474, 92]).fill();
        doc.restore();

        // ── Logo ───────────────────────────────────────────────────────────
        // Try: light version first (for navy bg), fall back to standard logo
        const logoCandidates = [
          path.join(__dirname, "motiva-logo-light.png"),
          path.join(__dirname, "motiva-logo.png"),
        ];
        const logoPath = logoCandidates.find((p) => fs.existsSync(p));
        if (logoPath) {
          doc.image(logoPath, X, 46, { fit: [48, 48] });
        } else {
          doc
            .font(FONT_BOLD)
            .fontSize(20)
            .fillColor(C.gold)
            .text("Motiva", X, 52, { lineBreak: false });
        }

        // ── Title ──────────────────────────────────────────────────────────
        doc
          .font(FONT_BOLD)
          .fontSize(40)
          .fillColor(C.white)
          .text("RECEIPT", X, 104, { characterSpacing: 2, lineBreak: false });
        label("PAYMENT ACKNOWLEDGEMENT", X, 154, C.gold, { characterSpacing: 2.4, fontSize: 6.5 });

        // ── Right column (date / receipt# / client) ────────────────────────
        const RX = 360;
        label("DATE ISSUED", RX, 48, C.gold);
        doc
          .font(FONT_BOLD)
          .fontSize(9)
          .fillColor(C.white)
          .text(receipt.dateIssued, RX, 60, { lineBreak: false });

        label("RECEIPT NUMBER", RX, 80, C.gold);
        doc
          .font(FONT_BOLD)
          .fontSize(9)
          .fillColor(C.white)
          .text(`#${receipt.receiptNumber}`, RX, 92, { lineBreak: false });

        label("ISSUED TO", RX, 112, C.gold);
        doc
          .font(FONT_BOLD)
          .fontSize(9)
          .fillColor(C.white)
          .text(client.fullName, RX, 124, { width: 200, lineBreak: false, ellipsis: true });
        let iy = 137;
        doc.font(FONT).fontSize(8).fillColor(C.white);
        if (client.phone) {
          doc.text(client.phone, RX, iy, { width: 200, lineBreak: false });
          iy += 11;
        }
        doc.text(client.email, RX, iy, { width: 200, lineBreak: false, ellipsis: true });

        // ── Curved white transition ────────────────────────────────────────
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

        // ── Payment description + amount box ──────────────────────────────
        label("PAYMENT DESCRIPTION", X, 222, C.navy);
        doc
          .font(FONT)
          .fontSize(9.5)
          .fillColor(C.text)
          .text(receipt.paymentDescription, X, 240, { width: 250 });

        doc.rect(343, 216, R - 343, 60).fill(C.gold);
        label("AMOUNT RECEIVED", 357, 228, C.navy);
        doc
          .font(FONT_BOLD)
          .fontSize(18)
          .fillColor(C.navy)
          .text(`${naira}${this.fmt(receipt.amountReceived)}`, 357, 244, { lineBreak: false });

        // ── Payment table ──────────────────────────────────────────────────
        let y = 298;
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

        // ── Amount in words ────────────────────────────────────────────────
        y += 20;
        label("AMOUNT IN WORDS", X, y, C.navy, { characterSpacing: 2 });
        y += 16;
        doc
          .font(FONT_BOLD)
          .fontSize(9)
          .fillColor(C.text)
          .text(receipt.amountInWords, X, y, { width: W });

        // ── Thank you / signature / QR ─────────────────────────────────────
        const blockY = Math.max(y + 60, 570);

        doc
          .font(FONT_BOLD)
          .fontSize(22)
          .fillColor(C.navy)
          .text("THANK YOU!", X, blockY + 22, { lineBreak: false });
        label("PLEASURE DOING BUSINESS WITH YOU", X, blockY + 52, C.navy, {
          fontSize: 6.5,
          characterSpacing: 1.4,
        });

        // Signature image (if uploaded) above the line
        const signatoryLabel = receipt.signatory?.trim() || "Finance Manager";
        if (sigBuffer) {
          try {
            doc.image(sigBuffer, 256, blockY, { fit: [140, 60] });
          } catch {
            // ignore corrupt image — line still renders
          }
        }

        // Signature line
        doc
          .moveTo(256, blockY + 68)
          .lineTo(430, blockY + 68)
          .lineWidth(1)
          .strokeColor(C.navy)
          .stroke();
        doc
          .font(FONT_BOLD)
          .fontSize(6.5)
          .fillColor(C.text)
          .text(signatoryLabel, 256, blockY + 74, { continued: true, lineBreak: false })
          .font(FONT)
          .text(" — Sign, Stamp & Date", { lineBreak: false });

        // QR code
        doc.image(qrBuffer, 448, blockY, { width: 73 });
        label("SCAN TO VERIFY", 448, blockY + 80, C.navy, {
          width: 73,
          align: "center",
          fontSize: 5.5,
          characterSpacing: 1,
        });

        // ── Disclaimer ─────────────────────────────────────────────────────
        const disclaimerText = receipt.disclaimer?.trim() || DEFAULT_DISCLAIMER;
        const discY = 683;
        doc.moveTo(X, discY).lineTo(R, discY).lineWidth(1).strokeColor(C.gold).stroke();
        label("DISCLAIMER", X, discY + 9, C.navy, { fontSize: 6, characterSpacing: 2 });
        doc
          .font(FONT)
          .fontSize(6.5)
          .fillColor(C.text)
          .text(disclaimerText, X, discY + 21, { width: W, lineGap: 2 });

        // ── Footer ─────────────────────────────────────────────────────────
        const footerParts: string[] = ["Motiva"];
        if (receipt.companyAddress?.trim()) footerParts.push(receipt.companyAddress.trim());
        if (receipt.companyWebsite?.trim()) footerParts.push(receipt.companyWebsite.trim());
        if (receipt.companyEmail?.trim()) footerParts.push(receipt.companyEmail.trim());
        if (receipt.companyPhone?.trim()) footerParts.push(receipt.companyPhone.trim());
        if (footerParts.length === 1) {
          footerParts.push(
            "123 Estate Avenue, Abuja, Nigeria",
            "www.motivaestate.com",
            "info@motivaestate.com",
            "+234 800 123 4567",
          );
        }
        const footerLine = footerParts.join("  |  ");

        const footY = 750;
        doc.moveTo(X, footY).lineTo(R, footY).lineWidth(1).strokeColor(C.gold).stroke();
        doc
          .font(FONT)
          .fontSize(6.5)
          .fillColor(C.text)
          .text(footerLine, X, footY + 12, { width: W, align: "center", lineBreak: false });

        // ── VOID watermark ─────────────────────────────────────────────────
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
}
