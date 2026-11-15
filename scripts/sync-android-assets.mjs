import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const androidAssetsDir = path.resolve('android/app/src/main/assets/public');

if (!fs.existsSync(distDir)) {
  console.error('[sync-android-assets] dist/ does not exist. Run "npm run build" first.');
  process.exit(1);
}

fs.rmSync(androidAssetsDir, { recursive: true, force: true });
fs.mkdirSync(androidAssetsDir, { recursive: true });
fs.cpSync(distDir, androidAssetsDir, { recursive: true });

console.log(`[sync-android-assets] Synced ${distDir} -> ${androidAssetsDir}`);
