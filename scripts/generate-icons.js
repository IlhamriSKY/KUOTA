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
      console.log('⚠️  Sharp not installed. Installing sharp...');
      const proc = Bun.spawn(['bun', 'add', '-d', 'sharp'], {
        stdout: 'inherit',
        stderr: 'inherit',
      });
      await proc.exited;
      sharp = (await import('sharp')).default;
    }

    console.log('📦 Generating PWA icons...');

    const svgBuffer = readFileSync(SVG_PATH);

    for (const size of SIZES) {
      const outputPath = join(ICONS_DIR, `icon-${size}x${size}.png`);
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`✓ Generated ${size}x${size}`);
    }

    // Generate favicon.ico (32x32)
    const faviconPath = join(process.cwd(), 'public/favicon.ico');
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(faviconPath);
    console.log('✓ Generated favicon.ico');

    // Generate apple-touch-icon (180x180)
    const appleTouchPath = join(ICONS_DIR, 'apple-touch-icon.png');
    await sharp(svgBuffer)
      .resize(180, 180)
      .png()
      .toFile(appleTouchPath);
    console.log('✓ Generated apple-touch-icon.png');

    console.log('✅ All icons generated successfully!');
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
