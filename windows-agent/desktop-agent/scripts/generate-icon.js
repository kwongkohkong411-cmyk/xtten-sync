const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

async function main() {
  const desktopRoot = path.resolve(__dirname, '..');
  const workspaceRoot = path.resolve(desktopRoot, '..', '..');
  const sourceSvgPath = path.resolve(workspaceRoot, 'frontend', 'public', 'favicon.svg');
  const targetSvgPath = path.resolve(desktopRoot, 'renderer', 'assets', 'xtten-logo.svg');
  const targetIcoPath = path.resolve(desktopRoot, 'build', 'app.ico');

  if (!fs.existsSync(sourceSvgPath)) {
    throw new Error(`Official logo not found at ${sourceSvgPath}`);
  }

  const logoSvg = fs.readFileSync(sourceSvgPath, 'utf8');
  fs.mkdirSync(path.dirname(targetSvgPath), { recursive: true });
  fs.writeFileSync(targetSvgPath, logoSvg, 'utf8');

  const sizes = [16, 32, 48, 256];
  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(Buffer.from(logoSvg))
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    ),
  );

  const icoBuffer = await pngToIco(pngBuffers);
  fs.mkdirSync(path.dirname(targetIcoPath), { recursive: true });
  fs.writeFileSync(targetIcoPath, icoBuffer);

  console.log('Generated app icon and synced renderer logo from frontend/public/favicon.svg');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
