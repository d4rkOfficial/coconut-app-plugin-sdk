/** 浮层渲染：配色、CSS、HTML。只产出片段 / 字符串，不碰 DOM。 */
import { h } from '../../plugin-api/jsx.ts'

/** Google Material 500 系配色：同名 Buff 稳定取色。 */
const CAT_COLORS = [
    '#F44336',
    '#E91E63',
    '#9C27B0',
    '#673AB7',
    '#3F51B5',
    '#2196F3',
    '#00BCD4',
    '#009688',
    '#4CAF50',
    '#8BC34A',
    '#FFC107',
    '#FF9800',
    '#FF5722',
    '#03A9F4',
]

export function colorOf(index) {
    return CAT_COLORS[index % CAT_COLORS.length]
}

/** 浮层 CSS（按昼夜主题给两套对比色）。 */
export function overlayCss(dark) {
    const ovBg = dark ? 'rgba(13,15,22,.16)' : 'rgba(255,255,255,.55)'
    const fg = dark ? '#e8e8ef' : '#1f2937'
    const title = dark ? '#fff' : '#0f172a'
    const trackBg = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'
    const barOpacity = dark ? '.58' : '.82'
    const barBorder = dark ? 'rgba(255,255,255,.42)' : 'rgba(0,0,0,.22)'
    const shadow = dark ? 'rgba(0,0,0,.7)' : 'rgba(0,0,0,.35)'
    const muted = dark ? '#aab' : '#6b7280'
    return `.cov-root { position:fixed; box-sizing:border-box; overflow-y:auto;
    background:${ovBg}; color:${fg}; padding:6px 8px 10px;
    font:12px/1.4 system-ui,-apple-system,"Microsoft YaHei",sans-serif;
    pointer-events:none; }
  .cov-title { display:flex; align-items:center; gap:7px;
    font-weight:600; font-size:12px; color:${title}; margin-bottom:6px;
    text-shadow:0 1px 2px ${shadow}; }
  .cov-sub { opacity:.85; font-size:10px; font-weight:400; margin-left:auto; }
  .cov-row { display:flex; align-items:center; padding:3px 0 4px; }
  .cov-name { flex:0 0 138px; min-width:0; padding-right:10px; box-sizing:border-box;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:10.5px; font-weight:600; color:${fg}; }
  .cov-track { flex:1; min-width:0; position:relative; height:22px; border-radius:8px;
    background:${trackBg}; overflow:hidden; }
  .cov-bar { position:absolute; top:1px; bottom:1px; border-radius:8px;
    opacity:var(--cov-o, .58); --cov-o:${barOpacity};
    min-width:9px; border:1px solid ${barBorder};
    box-shadow:0 0 0 1px rgba(0,0,0,.3) inset, 0 1px 2px rgba(0,0,0,.25); }
  .cov-bar.cov-pop { animation: covPop .3s ease; }
  @keyframes covPop { from { opacity:0; transform:scale(.85,.55); }
    to { opacity:var(--cov-o, .58); transform:none; } }
  .cov-empty { color:${muted}; padding:6px 0; text-shadow:0 1px 2px ${shadow}; }`
}

/**
 * 生成浮层 HTML。
 * @param {Array<{ sig: string, segments: Array<{first:number,last:number}>, members: Array<{name:string}> }>} clusters
 * @param {number} ovLeft 浮层左边界（视口 px）
 * @param {number} ovW 浮层宽度
 * @param {{ a: number, b: number } | null} fit pos→px 拟合
 * @param {boolean} dark 是否深色主题
 * @param {{ top?: number, height?: number }} geom 浮层几何
 * @returns {{ html: object, bars: Array<{ key: string, left: string, width: string }> }} html 是
 * JSX 产出的 HTML 片段（`Markup`），可以直接给 `ui.overlay`
 */
export function buildHtml(clusters, ovLeft, ovW, fit, dark, geom) {
    const g = geom || {}
    const rootStyle = {
        left: `${ovLeft | 0}px`,
        top: `${(g.top | 0) || 0}px`,
        width: `${ovW | 0}px`,
        height: `${(g.height | 0) || 100}px`,
    }
    const theme = dark ? 'dark' : 'light'
    const head = (
        <div class='cov-title'>
            <span>Buff 覆盖范围</span>
        </div>
    )

    if (!clusters.length) {
        return {
            html: (
                <div class='cov-root' data-theme={theme} style={rootStyle}>
                    {head}
                    <div class='cov-empty'>当前排轴暂无绑定 Buff</div>
                </div>
            ),
            bars: [],
        }
    }
    if (!fit) {
        return {
            html: (
                <div class='cov-root' data-theme={theme} style={rootStyle}>
                    {head}
                    <div class='cov-empty'>正在标定坐标…（需 ≥2 个可见操作块）</div>
                </div>
            ),
            bars: [],
        }
    }

    const width = Math.max(1, ovW)
    const NAME_COL = 148 // 左侧名字列宽（138 名字 + 10 间距）
    const trackW = Math.max(width - NAME_COL, 1)
    // 按行内最长色块（像素）从长到短排序
    const sorted = clusters
        .map((cluster) => {
            let maxW = 0
            for (const segment of cluster.segments) {
                const w = fit.b * (segment.last - segment.first)
                if (w > maxW) maxW = w
            }
            return { cluster, len: maxW }
        })
        .sort((a, b) => b.len - a.len)

    const barGeos = []
    const rows = sorted.map(({ cluster }, index) => {
        const color = colorOf(index)
        const bars = cluster.segments.map((segment, si) => {
            const sx = fit.a + fit.b * segment.first
            const ex = fit.a + fit.b * segment.last
            const leftPct = ((sx - ovLeft - NAME_COL) / trackW) * 100
            const widthPct = Math.max(((ex - sx) / trackW) * 100, 3.2)
            const key = `${cluster.sig}#${si}`
            barGeos.push({ key, left: leftPct.toFixed(2), width: widthPct.toFixed(2) })
            return (
                <div
                    class='cov-bar'
                    data-k={key}
                    style={{
                        left: `${leftPct.toFixed(1)}%`,
                        width: `${widthPct.toFixed(1)}%`,
                        background: color,
                    }}
                >
                </div>
            )
        })
        const label = cluster.members.length > 1
            ? cluster.members.map((member) => member.name).join('·')
            : cluster.members[0].name
        return (
            <div class='cov-row'>
                <span class='cov-name' style={{ color }} title={label}>{label}</span>
                <div class='cov-track'>{bars}</div>
            </div>
        )
    })

    return {
        html: (
            <div class='cov-root' data-theme={theme} style={rootStyle}>
                {head}
                <div class='cov-rows'>{rows}</div>
            </div>
        ),
        bars: barGeos,
    }
}
