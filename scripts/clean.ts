/**
 * 删掉打包产物（dist/）。等价 `rm -rf dist`，跨平台。
 *
 * 用法：deno task clean
 */
import { dim, distDir, exists, log } from './lib.ts';

if (exists(distDir)) {
  Deno.removeSync(distDir, { recursive: true });
  log(dim(`已删除 ${distDir}`));
} else {
  log(dim('dist/ 不存在，无需清理'));
}
