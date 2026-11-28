import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const androidAssetsDir = path.resolve('android/app/src/main/assets/public');

if (!fs.existsSync(distDir)) {
  console.error('[sync-android-assets] dist/ does not exist. Run "npm run build" first.');
  process.exit(1);
}

// Keep the Android TV APK ultra-lightweight:
// - Exclude GitHub Pages static caches (api/, movie/, catalog-index.json, 404.html, SW files)
// - Exclude chat attachment folder (assets/aistudio/)
// - Exclude stripped dead Next.js JS chunks under _next/static/chunks/ (keep CSS & fonts only)
// - Deduplicate <route>.html when <route>/index.html already exists
const EXCLUDED_TOP_DIRS = new Set(['api', 'movie']);
const EXCLUDED_FILES = new Set([
  '.nojekyll',
  '404.html',
  'catalog-index.json',
  'sw.js',
  'registerSW.js',
]);

fs.rmSync(androidAssetsDir, { recursive: true, force: true });
fs.mkdirSync(androidAssetsDir, { recursive: true });

let fileCount = 0;
let totalBytes = 0;

function copyFiltered(src, dest, relDir = '') {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.name.endsWith('.map') || entry.name.startsWith('workbox-')) continue;
    if (!relDir && entry.isDirectory() && EXCLUDED_TOP_DIRS.has(entry.name)) continue;
    if (!relDir && entry.isFile() && EXCLUDED_FILES.has(entry.name)) continue;

    // Never bundle workspace chat attachments into the APK
    if (relPath === 'assets/aistudio') continue;

    // Strip unused Next.js JS chunks (Kaira strips them in prepareServedHtml; keep CSS only)
    if (relDir === '_next/static/chunks' && entry.isFile() && !entry.name.endsWith('.css')) {
      continue;
    }

    // Deduplicate root-level <route>.html when <route>/index.html exists
    if (!relDir && entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'index.html') {
      const stem = entry.name.slice(0, -5);
      if (fs.existsSync(path.join(src, stem, 'index.html'))) {
        continue;
      }
    }

    // Under tv/, keep only tv/index.html — individual show detail pages resolve live
    if (relDir === 'tv' && entry.isDirectory()) continue;
    // Under watch/, keep only the lightweight watch shell template
    if (relDir === 'watch' && entry.isDirectory() && entry.name !== 'heart-of-the-beast-2026') {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyFiltered(srcPath, destPath, relPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      fileCount += 1;
      totalBytes += fs.statSync(srcPath).size;
    }
  }
}

copyFiltered(distDir, androidAssetsDir, '');

const mb = (totalBytes / (1024 * 1024)).toFixed(2);
console.log(`[sync-android-assets] Synced ${fileCount} ultra-lightweight files (${mb} MB uncompressed) -> ${androidAssetsDir}`);
