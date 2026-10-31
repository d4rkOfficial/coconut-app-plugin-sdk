/**
 * 几何标定：把时间轴的逻辑坐标 pos 映射到视口像素 left。
 *
 * 工具箱不会告诉你 pos→像素 的换算，只能自己量：页面里读一批
 * `[data-block]` 元素的真实 left，再从 IndexedDB 拿到它们的 pos，
 * 用最小二乘拟合一条直线 left = a + b * pos。
 */

/**
 * @param {Array<{ pos: number, left: number }>} samples
 * @return {{ a: number, b: number } | null}
 */
export function fitPos(samples) {
  if (!samples || samples.length < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const sample of samples) {
    sx += sample.pos;
    sy += sample.left;
    sxx += sample.pos * sample.pos;
    sxy += sample.pos * sample.left;
  }
  const n = samples.length;
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-9) return null;
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  if (!isFinite(a) || !isFinite(b) || b <= 0) return null;
  return { a, b };
}
