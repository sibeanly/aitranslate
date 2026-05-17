// Generate proper icons for the LLM Translate extension
// Creates blue square icons with a white "T" letter at 16x16, 48x48, 128x128

const fs = require('fs');
const zlib = require('zlib');

function createPNG(width, height, pixels) {
  // PNG format: signature + IHDR + IDAT + IEND

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeData));
    return Buffer.concat([len, typeData, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const idx = y * (1 + width * 4) + 1 + x * 4;
      const pIdx = (y * width + x) * 4;
      rawData[idx] = pixels[pIdx];     // R
      rawData[idx + 1] = pixels[pIdx + 1]; // G
      rawData[idx + 2] = pixels[pIdx + 2]; // B
      rawData[idx + 3] = pixels[pIdx + 3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawData);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function generateIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  // Background: blue (#4A90D9)
  const bgR = 74, bgG = 144, bgB = 217;

  // Draw a rounded rectangle background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const margin = Math.max(1, Math.floor(size * 0.08));
      const radius = Math.max(1, Math.floor(size * 0.15));

      const inBounds = x >= margin && x < size - margin && y >= margin && y < size - margin;

      // Simple rounded corner check
      const corners = [
        [margin + radius, margin + radius],
        [size - margin - radius - 1, margin + radius],
        [margin + radius, size - margin - radius - 1],
        [size - margin - radius - 1, size - margin - radius - 1],
      ];

      let inCorner = false;
      for (const [cx, cy] of corners) {
        const dx = x - cx;
        const dy = y - cy;
        if ((x < margin + radius || x >= size - margin - radius) &&
            (y < margin + radius || y >= size - margin - radius)) {
          if (dx * dx + dy * dy <= radius * radius) {
            inCorner = true;
          }
        }
      }

      const inRect = inBounds && (
        (x >= margin + radius && x < size - margin - radius) ||
        (y >= margin + radius && y < size - margin - radius) ||
        inCorner
      );

      if (inRect) {
        pixels[idx] = bgR;
        pixels[idx + 1] = bgG;
        pixels[idx + 2] = bgB;
        pixels[idx + 3] = 255;
      } else {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  // Draw "T" letter in white
  const letterMargin = Math.max(1, Math.floor(size * 0.2));
  const letterTop = Math.max(1, Math.floor(size * 0.15));
  const letterBottom = size - Math.max(1, Math.floor(size * 0.15));
  const barHeight = Math.max(2, Math.floor(size * 0.18));
  const stemWidth = Math.max(2, Math.floor(size * 0.18));
  const stemLeft = Math.floor((size - stemWidth) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const isTopBar = y >= letterTop + Math.floor(size * 0.08) &&
                       y < letterTop + Math.floor(size * 0.08) + barHeight &&
                       x >= letterMargin + Math.floor(size * 0.05) &&
                       x < size - letterMargin - Math.floor(size * 0.05);

      const isStem = x >= stemLeft && x < stemLeft + stemWidth &&
                     y >= letterTop + Math.floor(size * 0.08) + barHeight &&
                     y < letterBottom - Math.floor(size * 0.08);

      if (isTopBar || isStem) {
        pixels[idx] = 255;     // R
        pixels[idx + 1] = 255; // G
        pixels[idx + 2] = 255; // B
        pixels[idx + 3] = 255; // A
      }
    }
  }

  return createPNG(size, size, pixels);
}

// Generate all three sizes
const sizes = [16, 48, 128];
for (const size of sizes) {
  const png = generateIcon(size);
  fs.writeFileSync(`src/assets/icon-${size}.png`, png);
  console.log(`Generated icon-${size}.png (${png.length} bytes)`);
}
