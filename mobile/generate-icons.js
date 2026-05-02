const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const base = __dirname;
const logo = path.join(base, 'assets/logo.jpg');

async function gen() {
  // Expo icon (1024x1024)
  await sharp(logo)
    .resize(1024, 1024, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(base, 'assets/icon.png'));
  console.log('icon.png done');

  // Adaptive icon foreground (1024x1024 with padding for safe zone)
  const adaptiveSize = 1024;
  const innerSize = 768;
  const padding = (adaptiveSize - innerSize) / 2;
  await sharp(logo)
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .extend({
      top: padding, bottom: padding, left: padding, right: padding,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toFile(path.join(base, 'assets/adaptive-icon.png'));
  console.log('adaptive-icon.png done');

  // Splash screen
  await sharp(logo)
    .resize(512, 512, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(base, 'assets/splash.png'));
  console.log('splash.png done');

  // Favicon
  await sharp(logo)
    .resize(48, 48, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(base, 'assets/favicon.png'));
  console.log('favicon.png done');

  // Android mipmap icons
  const mipmapSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const resDir = path.join(base, 'android/app/src/main/res');

  for (const [density, size] of Object.entries(mipmapSizes)) {
    const dir = path.join(resDir, 'mipmap-' + density);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Standard icon (square with white background)
    await sharp(logo)
      .resize(size, size, { fit: 'contain', background: '#ffffff' })
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // Round icon (circular mask)
    const roundBuf = await sharp(logo)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toBuffer();

    const r = size / 2;
    const circleSvg = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`
    );
    const mask = await sharp(circleSvg).resize(size, size).png().toBuffer();

    await sharp(roundBuf)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // Foreground for adaptive icons
    const fgSize = Math.round(size * 0.75);
    const pad = Math.round((size - fgSize) / 2);
    await sharp(logo)
      .resize(fgSize, fgSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .extend({
        top: pad, bottom: pad, left: pad, right: pad,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .resize(size, size)
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));

    console.log(density + ' icons done (' + size + 'px)');
  }

  console.log('ALL ICONS GENERATED SUCCESSFULLY');
}

gen().catch(e => { console.error(e); process.exit(1); });
