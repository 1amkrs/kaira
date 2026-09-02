import QRCode from 'qrcode';

export interface QRCodeOptions {
  sizePx?: number;
  fgColor?: string;
  bgColor?: string;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Generates an SVG string representation of the QR code.
 */
export async function generateQRCodeSVGAsync(
  text: string,
  options: QRCodeOptions = {}
): Promise<string> {
  const {
    sizePx = 240,
    fgColor = '#000000',
    bgColor = '#ffffff',
    margin = 2,
    errorCorrectionLevel = 'M',
  } = options;

  try {
    return await QRCode.toString(text, {
      type: 'svg',
      width: sizePx,
      margin,
      errorCorrectionLevel,
      color: {
        dark: fgColor,
        light: bgColor,
      },
    });
  } catch (err) {
    console.warn('[QRCodeGenerator] Error generating SVG:', err);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}"><rect width="100%" height="100%" fill="${bgColor}"/><text x="50%" y="50%" text-anchor="middle" fill="${fgColor}" font-size="12">QR Error</text></svg>`;
  }
}

/**
 * Synchronous SVG generator using QR matrix structure.
 */
export function generateQRCodeSVG(
  text: string,
  sizePx: number = 240,
  fgColor: string = '#000000',
  bgColor: string = '#ffffff'
): string {
  try {
    const qrData = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const moduleCount = qrData.modules.size;
    const margin = 2;
    const totalSize = moduleCount + margin * 2;
    const data = qrData.modules.data;

    let rects = '';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (data[r * moduleCount + c]) {
          rects += `<rect x="${c + margin}" y="${r + margin}" width="1.02" height="1.02" fill="${fgColor}" />`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
      <rect width="${totalSize}" height="${totalSize}" fill="${bgColor}" />
      ${rects}
    </svg>`;
  } catch (e) {
    console.warn('[QRCodeGenerator] Sync create fallback:', e);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}"><rect width="100%" height="100%" fill="${bgColor}"/><text x="50%" y="50%" text-anchor="middle" fill="${fgColor}" font-size="12">Scan QR</text></svg>`;
  }
}
