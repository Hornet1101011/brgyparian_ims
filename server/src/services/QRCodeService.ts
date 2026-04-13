import QRCode from 'qrcode';
// Stubbed missing config
const config = {};

export class QRCodeService {
  private static readonly BASE_URL = 'http://localhost:3000';

  static async generateDocumentQR(documentId: string, isOnline: boolean = true): Promise<string> {
    try {
      // For document verification we only encode the transaction/document id itself
      const payload = String(documentId || '');
      // Generate QR code as data URL (base64) with a slightly smaller size
      const qrDataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'H', // High error correction level
        margin: 1,
        width: 120,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      return qrDataUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  static async generateDocumentQRBuffer(documentId: string, isOnline: boolean = true): Promise<Buffer> {
    try {
      // Only encode the transaction/document id in the QR
      const payload = String(documentId || '');
      // Generate QR code as buffer (smaller size)
      const qrBuffer = await QRCode.toBuffer(payload, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 120,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      return qrBuffer;
    } catch (error) {
      console.error('Error generating QR code buffer:', error);
      throw new Error('Failed to generate QR code buffer');
    }
  }
}
