#!/usr/bin/env bun

/**
 * Generate PWA icons from SVG
 * Uses sharp for image processing
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const SVG_PATH = join(process.cwd(), 'public/icons/icon.svg');
const ICONS_DIR = join(process.cwd(), 'public/icons');

async function generateIcons() {
  try {
    // Check if sharp is available
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (e) {
      console.log('Sharp not installed. Installing sharp...');
      const proc = Bun.spawn(['bun', 'add', '-d', 'sharp'], {
        stdout: 'inherit',
        stderr: 'inherit',
      });
      await proc.exited;
      sharp = (await import('sharp')).default;
    }

    console.log('Generating PWA icons...');

    const svgBuffer = readFileSync(SVG_PATH);

    for (const size of SIZES) {
      const outputPath = join(ICONS_DIR, `icon-${size}x${size}.png`);
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Generated ${size}x${size}`);
    }

    // Generate favicon.ico (32x32)
    const faviconPath = join(process.cwd(), 'public/favicon.ico');
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(faviconPath);
    console.log('Generated favicon.ico');

    // Generate app-icon.ico (proper ICO format for exe and window title)
    // Uses a version with dark background + thicker strokes for small sizes
    const icoSvg = Buffer.from(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' fill='none'>
  <rect width='512' height='512' rx='80' fill='#0c1424'/>
  <g transform='translate(256 256)'>
    <g transform='rotate(-25)'>
      <circle cx='0' cy='0' r='170' stroke='#6d9eff' stroke-width='32' fill='none'/>
      <circle cx='0' cy='0' r='115' stroke='#6d9eff' stroke-width='32' fill='none'/>
      <circle cx='0' cy='0' r='55' stroke='#6d9eff' stroke-width='32' fill='none'/>
      <circle cx='0' cy='-143' r='32' fill='#6d9eff' stroke='none'/>
      <path d='M 0,-116 L 0,-58' stroke='#6d9eff' stroke-width='32' stroke-linecap='round'/>
    </g>
  </g>
</svg>`);
    const icoSizes = [16, 32, 48, 256];
    const pngBuffers = await Promise.all(
      icoSizes.map(s => sharp(icoSvg).resize(s, s).png().toBuffer())
    );
    const count = pngBuffers.length;
    const headerSize = 6 + count * 16;
    let offset = headerSize;
    const entries = [];
    for (let i = 0; i < count; i++) {
      entries.push({ size: icoSizes[i] === 256 ? 0 : icoSizes[i], offset, data: pngBuffers[i] });
      offset += pngBuffers[i].length;
    }
    const icoBuf = Buffer.alloc(offset);
    icoBuf.writeUInt16LE(0, 0);       // reserved
    icoBuf.writeUInt16LE(1, 2);       // type = ICO
    icoBuf.writeUInt16LE(count, 4);   // image count
    let entryOff = 6;
    for (const e of entries) {
      icoBuf.writeUInt8(e.size, entryOff);
      icoBuf.writeUInt8(e.size, entryOff + 1);
      icoBuf.writeUInt8(0, entryOff + 2);
      icoBuf.writeUInt8(0, entryOff + 3);
      icoBuf.writeUInt16LE(1, entryOff + 4);
      icoBuf.writeUInt16LE(32, entryOff + 6);
      icoBuf.writeUInt32LE(e.data.length, entryOff + 8);
      icoBuf.writeUInt32LE(e.offset, entryOff + 12);
      entryOff += 16;
    }
    for (const e of entries) {
      e.data.copy(icoBuf, e.offset);
    }
    writeFileSync(join(process.cwd(), 'public/app-icon.ico'), icoBuf);
    console.log('Generated app-icon.ico (proper ICO format)');

    // Generate apple-touch-icon (180x180)
    const appleTouchPath = join(ICONS_DIR, 'apple-touch-icon.png');
    await sharp(svgBuffer)
      .resize(180, 180)
      .png()
      .toFile(appleTouchPath);
    console.log('Generated apple-touch-icon.png');

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
