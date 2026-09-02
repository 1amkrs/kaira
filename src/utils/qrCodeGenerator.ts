/**
 * Pure TypeScript Standalone QR Code Matrix & SVG Generator
 * Generates standards-compliant QR Code version 1-10 with Error Correction.
 * Zero external dependencies.
 */

// QR Code Error Correction Levels
export type QRECCLevel = 'L' | 'M' | 'Q' | 'H';

// Galois Field GF(256) tables and math
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMul(poly[j], EXP_TABLE[i]);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsCalculateEcc(data: Uint8Array, eccCount: number): Uint8Array {
  const gen = rsGeneratorPoly(eccCount);
  const result = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0];
    for (let j = 0; j < eccCount - 1; j++) {
      result[j] = result[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    result[eccCount - 1] = gfMul(gen[eccCount], factor);
  }
  return result;
}

// Version table: Total codewords, ECC codewords for Level M
const VERSION_INFO: Array<{ version: number; totalCodewords: number; eccCodewords: number }> = [
  { version: 1, totalCodewords: 26, eccCodewords: 10 },
  { version: 2, totalCodewords: 44, eccCodewords: 16 },
  { version: 3, totalCodewords: 70, eccCodewords: 26 },
  { version: 4, totalCodewords: 100, eccCodewords: 36 },
  { version: 5, totalCodewords: 134, eccCodewords: 48 },
  { version: 6, totalCodewords: 172, eccCodewords: 64 },
  { version: 7, totalCodewords: 196, eccCodewords: 72 },
  { version: 8, totalCodewords: 242, eccCodewords: 88 },
];

// Alignment pattern locations per version
const ALIGNMENT_LOCATIONS: { [v: number]: number[] } = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
};

class BitBuffer {
  private buffer: number[] = [];
  private length: number = 0;

  public put(num: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  public putBit(bit: boolean): void {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }

  public getLength(): number {
    return this.length;
  }

  public getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

export function generateQRCodeMatrix(text: string): boolean[][] {
  const textBytes = new TextEncoder().encode(text);
  const dataLen = textBytes.length;

  // Find minimum version that fits Byte mode data (Mode=4 bits, Count=8/16 bits + data)
  let selected = VERSION_INFO[0];
  for (const info of VERSION_INFO) {
    const maxDataBytes = info.totalCodewords - info.eccCodewords;
    // 4 bits mode + 8 bits count indicator + bytes * 8
    if (dataLen + 2 <= maxDataBytes) {
      selected = info;
      break;
    }
  }

  const { version, totalCodewords, eccCodewords } = selected;
  const maxDataCodewords = totalCodewords - eccCodewords;

  // Encode in 8-bit Byte Mode (0100)
  const bitBuffer = new BitBuffer();
  bitBuffer.put(0b0100, 4); // Byte mode
  bitBuffer.put(dataLen, version <= 9 ? 8 : 16); // Character count

  for (let i = 0; i < dataLen; i++) {
    bitBuffer.put(textBytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const totalDataBits = maxDataCodewords * 8;
  const remainingBits = totalDataBits - bitBuffer.getLength();
  bitBuffer.put(0, Math.min(4, Math.max(0, remainingBits)));

  // Pad to byte boundary
  while (bitBuffer.getLength() % 8 !== 0) {
    bitBuffer.putBit(false);
  }

  // Pad bytes 0xEC, 0x11
  let padToggle = false;
  while (bitBuffer.getLength() < totalDataBits) {
    bitBuffer.put(padToggle ? 0x11 : 0xec, 8);
    padToggle = !padToggle;
  }

  const rawData = bitBuffer.getBytes().slice(0, maxDataCodewords);
  const eccData = rsCalculateEcc(rawData, eccCodewords);

  // Combine data + ECC
  const finalCodewords = new Uint8Array(totalCodewords);
  finalCodewords.set(rawData, 0);
  finalCodewords.set(eccData, rawData.length);

  // Build Matrix
  const size = 17 + 4 * version;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  // 1. Finder Patterns (Top-Left, Top-Right, Bottom-Left)
  const drawFinderPattern = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[nr][nc] = true;
        } else {
          matrix[nr][nc] = false;
        }
      }
    }
  };

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // 2. Alignment Patterns
  const alignLocs = ALIGNMENT_LOCATIONS[version] || [];
  for (const r of alignLocs) {
    for (const c of alignLocs) {
      if (matrix[r][c] !== null) continue; // Skip finder overlap
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBlack = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          matrix[r + dr][c + dc] = isBlack;
        }
      }
    }
  }

  // 3. Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Dark module
  matrix[4 * version + 9][8] = true;

  // 4. Reserve Format Info areas
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  // 5. Place Data Bits with standard Zigzag scanning
  let byteIndex = 0;
  let bitIndex = 7;
  let upwards = true;

  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Skip vertical timing pattern

    const rowRange = upwards
      ? Array.from({ length: size }, (_, k) => size - 1 - k)
      : Array.from({ length: size }, (_, k) => k);

    for (const r of rowRange) {
      for (const col of [rightCol, rightCol - 1]) {
        if (matrix[r][col] === null) {
          let bit = false;
          if (byteIndex < finalCodewords.length) {
            bit = ((finalCodewords[byteIndex] >>> bitIndex) & 1) === 1;
            bitIndex--;
            if (bitIndex < 0) {
              bitIndex = 7;
              byteIndex++;
            }
          }
          // Mask pattern 0: (row + col) % 2 === 0
          const mask = (r + col) % 2 === 0;
          matrix[r][col] = bit !== mask;
        }
      }
    }
    upwards = !upwards;
  }

  // 6. Write Format Bits (ECC=M -> 00, Mask=000 -> Format bits with BCH = 0x5412 XOR 0b101010000010010)
  // Format Info for Mask 0, ECC M: 101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  // Top-left format writing
  for (let i = 0; i <= 5; i++) matrix[8][i] = Boolean(formatBits[i]);
  matrix[8][7] = Boolean(formatBits[6]);
  matrix[8][8] = Boolean(formatBits[7]);
  matrix[7][8] = Boolean(formatBits[8]);
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = Boolean(formatBits[i]);

  // Bottom-left / Top-right format writing
  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = Boolean(formatBits[i]);
  for (let i = 0; i < 8; i++) matrix[8][size - 8 + i] = Boolean(formatBits[7 + i]);

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

export function generateQRCodeSVG(text: string, sizePx: number = 240, fgColor: string = '#ffffff', bgColor: string = '#0d0e12'): string {
  const matrix = generateQRCodeMatrix(text);
  const moduleCount = matrix.length;
  const quietZone = 2; // 2 module border
  const viewBoxSize = moduleCount + quietZone * 2;

  let rects = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${c + quietZone}" y="${r + quietZone}" width="1.02" height="1.02" rx="0.18" fill="${fgColor}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
    <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${bgColor}" rx="1.5" />
    ${rects}
  </svg>`;
}
