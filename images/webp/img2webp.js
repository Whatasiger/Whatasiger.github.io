// img2webp.js — 图片批量转 WebP 工具
// 使用方法：双击运行（需先安装 Node.js）
// 转换后的 .webp 文件与原文件同目录，原文件保留不删除

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/* ========== 配置区 ========== */
const WEBP_QUALITY = 80;           // WebP 画质 (0-100)，80 是体积/画质的甜点
const SUPPORTED_EXTS = ['.jpg', '.jpeg', '.png'];
const SCRIPT_DIR = __dirname;
/* ============================ */

// ANSI 颜色（Win10+ 终端支持）
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

// 格式化文件大小
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// 确保 sharp 已安装（首次运行自动安装）
function ensureSharp() {
  try {
    return require('sharp');
  } catch (_) {
    console.log(`${C.yellow}未检测到 sharp 库，正在自动安装...${C.reset}`);
    // 确保有 package.json，避免 npm 警告
    const pkgPath = path.join(SCRIPT_DIR, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      fs.writeFileSync(pkgPath, JSON.stringify({ private: true }, null, 2));
    }
    try {
      execSync('npm install sharp --no-save', {
        cwd: SCRIPT_DIR,
        stdio: 'pipe',     // 静默安装，不刷屏
      });
      console.log(`${C.green}sharp 安装完成！${C.reset}\n`);
      return require('sharp');
    } catch (err) {
      console.error(`${C.red}安装 sharp 失败，请确认已安装 Node.js 并可访问 npm。${C.reset}`);
      console.error(`${C.dim}可手动执行：npm install sharp${C.reset}`);
      process.exit(1);
    }
  }
}

// 转换单张图片
async function convertToWebp(sharp, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath, ext);
  const outputPath = path.join(path.dirname(filePath), basename + '.webp');

  // 同名 .webp 已存在则跳过
  if (fs.existsSync(outputPath)) {
    console.log(`  ${C.yellow}跳过${C.reset}  ${basename}${ext} ${C.dim}(已有 ${basename}.webp)${C.reset}`);
    return { skipped: true, saved: 0 };
  }

  const inputSize = fs.statSync(filePath).size;

  // 有损压缩：quality 80 在视觉上几乎无损，体积通常减少 25%-60%
  await sharp(filePath)
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toFile(outputPath);

  const outputSize = fs.statSync(outputPath).size;
  const saved = inputSize - outputSize;
  const pct = ((1 - outputSize / inputSize) * 100).toFixed(1);
  const arrow = saved > 0 ? `${C.green}↓${pct}%${C.reset}` : `${C.red}↑${Math.abs(pct)}%${C.reset}`;

  console.log(`  ${C.green}完成${C.reset}  ${basename}${ext} → ${basename}.webp  ` +
    `${C.dim}${fmtSize(inputSize)} → ${fmtSize(outputSize)}${C.reset}  ${arrow}`);

  return { skipped: false, saved, count: 1 };
}

// 主流程
async function main() {
  console.log(`\n${C.bright}${C.cyan}╔══════════════════════════════════╗`);
  console.log(`║      图片转 WebP 批量工具       ║`);
  console.log(`╚══════════════════════════════════╝${C.reset}\n`);

  const sharp = ensureSharp();

  console.log(`${C.cyan}扫描目录：${C.reset}${SCRIPT_DIR}`);
  console.log(`${C.cyan}目标画质：${C.reset}${WEBP_QUALITY} / 100\n`);

  // 筛选可转换的图片文件
  const allFiles = fs.readdirSync(SCRIPT_DIR);
  const imageFiles = allFiles.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return SUPPORTED_EXTS.includes(ext);
  });

  if (imageFiles.length === 0) {
    console.log(`${C.yellow}未找到 .jpg / .png / .jpeg 图片文件。${C.reset}`);
    pause();
    return;
  }

  console.log(`${C.bright}找到 ${imageFiles.length} 个图片文件，开始转换：${C.reset}\n`);

  let totalSaved = 0;
  let totalConverted = 0;
  let totalSkipped = 0;

  for (const file of imageFiles) {
    try {
      const result = await convertToWebp(sharp, path.join(SCRIPT_DIR, file));
      if (result.skipped) {
        totalSkipped++;
      } else {
        totalConverted++;
        totalSaved += result.saved;
      }
    } catch (err) {
      const basename = path.basename(file);
      console.error(`  ${C.red}失败${C.reset}  ${basename} — ${err.message}`);
    }
  }

  // 汇总报告
  console.log(`\n${C.dim}──────────────────────────────────${C.reset}`);
  console.log(`${C.bright}转换完成！${C.reset}  成功 ${C.green}${totalConverted}${C.reset} 个` +
    (totalSkipped > 0 ? `，跳过 ${C.yellow}${totalSkipped}${C.reset} 个` : '') +
    (totalSaved > 0 ? `，共节省 ${C.green}${fmtSize(totalSaved)}${C.reset}` : ''));
  console.log(`${C.dim}原文件已保留，未做任何删除。${C.reset}\n`);

  pause();
}

// 双击运行时暂停，防止窗口闪退
function pause() {
  if (process.stdin.isTTY) {
    console.log(`${C.dim}按回车键退出...${C.reset}`);
    const buf = Buffer.alloc(1);
    fs.readSync(0, buf, 0, 1);
  }
}

main().catch(err => {
  console.error(`${C.red}发生错误：${C.reset}${err.message}`);
  pause();
});