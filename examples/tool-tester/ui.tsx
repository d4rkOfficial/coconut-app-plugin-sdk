/**
 * 工具测试台浮层外壳（赛博朋克风）：只产出 HTML / CSS。
 * 工具列表、参数表单、日志追加都由 page/panel.dom.ts 在页面里渲染。
 */
import { css, h } from '../../plugin-api/jsx.ts'

export function buildPanel() {
    const html = (
        <div class='tt-root'>
            <div class='tt-scan'></div>
            <div class='tt-head'>
                <span class='tt-led'></span>
                <span class='tt-title'>TOOL // TESTBED</span>
                <span class='tt-count'>LINKING…</span>
                <button class='tt-min' type='button' title='收成悬浮球' aria-label='收成悬浮球'>
                    −
                </button>
            </div>

            <div class='tt-body'>
                <aside class='tt-side'>
                    <div class='tt-side-label'>TOOL INDEX</div>
                    <input
                        class='tt-search'
                        type='search'
                        placeholder='搜索工具…'
                        autocomplete='off'
                        spellcheck='false'
                    />
                    <div class='tt-list'>
                        <div class='tt-empty'>正在加载工具索引…</div>
                    </div>
                </aside>

                <section class='tt-main'>
                    <div class='tt-log-head'>
                        <span class='tt-log-title'>OUTPUT STREAM</span>
                        <button class='tt-clear' type='button'>清空</button>
                    </div>
                    <textarea
                        class='tt-log'
                        readonly
                        spellcheck='false'
                        placeholder='点击左侧工具，填好参数后确认调用；这里只读，结果会自动追加。'
                    />
                </section>
            </div>

            <div class='tt-dialog'>
                <div class='tt-dialog-card'>
                    <div class='tt-dialog-title'></div>
                    <div class='tt-dialog-desc'></div>
                    <div class='tt-dialog-hint'>
                        必填项带 <b>*</b>；枚举值用下拉框；数组 / 对象字段填 JSON。
                    </div>
                    <div class='tt-form'></div>
                    <div class='tt-dialog-error'></div>
                    <div class='tt-dialog-actions'>
                        <button class='tt-cancel' type='button'>取消</button>
                        <button class='tt-confirm' type='button'>执行调用</button>
                    </div>
                </div>
            </div>

            <button
                class='tt-ball'
                type='button'
                title='展开工具测试台'
                aria-label='展开工具测试台'
            >
                测
            </button>
        </div>
    )

    const skin = css`
        @keyframes tt-spin {
            to {
                transform: translate(-50%, -50%) rotate(360deg);
            }
        }
        @keyframes tt-pulse {
            0%,
            100% {
                opacity: 0.55;
                box-shadow: 0 0 6px rgba(0, 240, 255, 0.6);
            }
            50% {
                opacity: 1;
                box-shadow: 0 0 12px rgba(255, 0, 212, 0.9);
            }
        }
        @keyframes tt-scanline {
            from {
                transform: translateY(-100%);
            }
            to {
                transform: translateY(100%);
            }
        }
        .tt-root {
            position: absolute;
            top: 68px;
            right: 24px;
            display: flex;
            flex-direction: column;
            width: 900px;
            max-width: calc(100vw - 48px);
            height: 580px;
            max-height: calc(100vh - 110px);
            padding: 2px;
            border-radius: 14px;
            background: #04060f;
            box-shadow:
                0 0 26px rgba(0, 240, 255, 0.22),
                0 24px 60px rgba(0, 0, 0, 0.65);
            color: #d7f7ff;
            font: 13px/1.5 'JetBrains Mono', ui-monospace, Consolas, 'Cascadia Mono', monospace;
            pointer-events: auto;
            overflow: hidden;
            isolation: isolate;
        }
        /* 旋转的流光边框 */
        .tt-root::before {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 190%;
            aspect-ratio: 1;
            transform: translate(-50%, -50%);
            background: conic-gradient(
                from 0deg,
                #00f0ff,
                #7a00ff,
                #ff00d4,
                #ffd319,
                #00ff9d,
                #00f0ff
            );
            animation: tt-spin 7s linear infinite;
            z-index: 0;
        }
        /* 边框内侧的暗色底 */
        .tt-root::after {
            content: '';
            position: absolute;
            inset: 2px;
            border-radius: 12px;
            background:
                linear-gradient(rgba(0, 240, 255, 0.045) 1px, transparent 1px) 0 0 / 100% 4px,
                radial-gradient(circle at 18% 0%, rgba(255, 0, 212, 0.16), transparent 52%),
                radial-gradient(circle at 88% 100%, rgba(0, 240, 255, 0.14), transparent 55%),
                rgba(5, 8, 20, 0.97);
            z-index: 0;
            pointer-events: none;
        }
        .tt-root > * {
            position: relative;
            z-index: 1;
        }
        .tt-scan {
            position: absolute;
            inset: 2px;
            z-index: 1;
            pointer-events: none;
            background: linear-gradient(
                to bottom,
                transparent,
                rgba(0, 240, 255, 0.05) 48%,
                rgba(0, 240, 255, 0.12) 50%,
                transparent 52%
            );
            background-size: 100% 260px;
            animation: tt-scanline 6s linear infinite;
            opacity: 0.6;
        }
        .tt-head {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-bottom: 1px solid rgba(0, 240, 255, 0.22);
            background: linear-gradient(90deg, rgba(0, 240, 255, 0.08), rgba(255, 0, 212, 0.06));
            cursor: move;
            user-select: none;
        }
        .tt-led {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #00f0ff;
            animation: tt-pulse 2.4s ease-in-out infinite;
        }
        .tt-title {
            font-weight: 700;
            font-size: 13px;
            letter-spacing: 2px;
            color: #9ffcff;
            text-shadow:
                0 0 6px rgba(0, 240, 255, 0.9),
                0 0 18px rgba(0, 240, 255, 0.45);
            white-space: nowrap;
        }
        .tt-count {
            margin-left: auto;
            color: #ff8ae2;
            font-size: 11px;
            letter-spacing: 1px;
            text-shadow: 0 0 8px rgba(255, 0, 212, 0.7);
            white-space: nowrap;
        }
        .tt-min {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            padding: 0 0 3px;
            border: 1px solid rgba(0, 240, 255, 0.5);
            border-radius: 4px;
            background: rgba(0, 240, 255, 0.08);
            color: #9ffcff;
            font: 16px/1 system-ui, sans-serif;
            cursor: pointer;
            box-shadow: inset 0 0 8px rgba(0, 240, 255, 0.18);
        }
        .tt-min:hover {
            background: rgba(255, 0, 212, 0.2);
            border-color: #ff00d4;
            color: #fff;
        }
        .tt-body {
            display: flex;
            flex: 1;
            min-height: 0;
        }
        .tt-side {
            display: flex;
            flex-direction: column;
            width: 300px;
            min-width: 230px;
            border-right: 1px solid rgba(255, 0, 212, 0.2);
            background: rgba(2, 4, 12, 0.55);
        }
        .tt-side-label,
        .tt-log-title {
            color: #5fd7e8;
            font-size: 10px;
            letter-spacing: 2px;
            opacity: 0.85;
        }
        .tt-side-label::before,
        .tt-log-title::before {
            content: '// ';
            color: #ff00d4;
        }
        .tt-side-label {
            padding: 10px 12px 0;
        }
        .tt-search {
            margin: 8px 10px 10px;
            padding: 8px 10px;
            border: 1px solid rgba(0, 240, 255, 0.35);
            border-radius: 4px;
            background: rgba(0, 20, 30, 0.6);
            color: #d7f7ff;
            font: inherit;
            outline: none;
            box-shadow: inset 0 0 10px rgba(0, 240, 255, 0.08);
        }
        .tt-search::placeholder {
            color: #4e7f8c;
        }
        .tt-search:focus {
            border-color: #ff00d4;
            box-shadow:
                inset 0 0 10px rgba(255, 0, 212, 0.15),
                0 0 10px rgba(255, 0, 212, 0.35);
        }
        .tt-list {
            flex: 1;
            min-height: 0;
            padding: 0 8px 10px;
            overflow-y: auto;
        }
        .tt-tool {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            margin: 2px 0;
            padding: 7px 9px;
            border: 1px solid transparent;
            border-left: 2px solid rgba(0, 240, 255, 0.25);
            border-radius: 3px;
            background: transparent;
            color: inherit;
            font: inherit;
            text-align: left;
            cursor: pointer;
        }
        .tt-tool:hover {
            border-color: rgba(0, 240, 255, 0.4);
            border-left-color: #ff00d4;
            background: linear-gradient(90deg, rgba(0, 240, 255, 0.12), transparent);
            color: #fff;
            text-shadow: 0 0 8px rgba(0, 240, 255, 0.8);
        }
        .tt-tool:active {
            background: rgba(255, 0, 212, 0.16);
        }
        .tt-tool-dot {
            flex: 0 0 auto;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #00f0ff;
            box-shadow: 0 0 6px #00f0ff;
        }
        .tt-tool-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tt-empty {
            padding: 18px 8px;
            color: #5f8794;
            font-size: 11px;
            letter-spacing: 1px;
            text-align: center;
        }
        .tt-main {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 0;
        }
        .tt-log-head {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-bottom: 1px solid rgba(0, 240, 255, 0.16);
        }
        .tt-clear {
            margin-left: auto;
            padding: 4px 12px;
            border: 1px solid rgba(255, 0, 212, 0.45);
            border-radius: 3px;
            background: rgba(255, 0, 212, 0.08);
            color: #ff9ce7;
            font: inherit;
            font-size: 11px;
            letter-spacing: 1px;
            cursor: pointer;
        }
        .tt-clear:hover {
            background: rgba(255, 0, 212, 0.22);
            color: #fff;
        }
        .tt-log {
            flex: 1;
            min-height: 0;
            width: 100%;
            box-sizing: border-box;
            padding: 12px 14px;
            border: 0;
            background:
                linear-gradient(rgba(0, 255, 157, 0.03) 1px, transparent 1px) 0 0 / 100% 3px,
                transparent;
            color: #9dffd9;
            font: 12px/1.6 'JetBrains Mono', ui-monospace, Consolas, 'Cascadia Mono', monospace;
            resize: none;
            outline: none;
            text-shadow: 0 0 6px rgba(0, 255, 157, 0.3);
        }
        .tt-log::placeholder {
            color: #476b64;
        }
        .tt-dialog {
            position: absolute;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(2, 3, 10, 0.72);
            backdrop-filter: blur(3px);
            z-index: 3;
        }
        .tt-dialog.open {
            display: flex;
        }
        .tt-dialog-card {
            display: flex;
            flex-direction: column;
            width: 560px;
            max-width: calc(100% - 40px);
            max-height: calc(100% - 40px);
            padding: 16px;
            border: 1px solid rgba(0, 240, 255, 0.55);
            border-radius: 6px;
            background: #060a16;
            box-shadow:
                0 0 22px rgba(0, 240, 255, 0.25),
                0 0 46px rgba(255, 0, 212, 0.18);
            overflow: hidden;
        }
        .tt-dialog-title {
            color: #9ffcff;
            font-weight: 700;
            font-size: 14px;
            letter-spacing: 1px;
            text-shadow: 0 0 8px rgba(0, 240, 255, 0.7);
            word-break: break-all;
        }
        .tt-dialog-desc {
            max-height: 64px;
            margin-top: 4px;
            color: #7fa6b3;
            font-size: 11px;
            overflow-y: auto;
        }
        .tt-dialog-hint {
            margin-top: 6px;
            color: #8c6f92;
            font-size: 11px;
        }
        .tt-dialog-hint b {
            color: #ff5fd7;
        }
        .tt-form {
            flex: 1;
            min-height: 0;
            margin-top: 10px;
            padding-right: 4px;
            overflow-y: auto;
        }
        .tt-field {
            margin-bottom: 10px;
        }
        .tt-field-label {
            display: flex;
            align-items: baseline;
            gap: 6px;
            color: #9ffcff;
            font-size: 12px;
            word-break: break-all;
        }
        .tt-field-req {
            color: #ff00d4;
        }
        .tt-field-type {
            margin-left: auto;
            color: #5f8794;
            font-size: 10px;
            letter-spacing: 1px;
        }
        .tt-field-desc {
            margin: 2px 0 4px;
            color: #6f8f9b;
            font-size: 10.5px;
        }
        .tt-input,
        .tt-select,
        .tt-json {
            width: 100%;
            box-sizing: border-box;
            padding: 7px 9px;
            border: 1px solid rgba(0, 240, 255, 0.3);
            border-radius: 3px;
            background: rgba(0, 18, 26, 0.75);
            color: #d7f7ff;
            font: inherit;
            font-size: 12px;
            outline: none;
        }
        .tt-json {
            min-height: 64px;
            resize: vertical;
            font-family: ui-monospace, Consolas, 'Cascadia Mono', monospace;
        }
        .tt-input:focus,
        .tt-select:focus,
        .tt-json:focus {
            border-color: #ff00d4;
            box-shadow: 0 0 9px rgba(255, 0, 212, 0.35);
        }
        .tt-field-empty {
            padding: 8px 2px;
            color: #8c6f92;
            font-size: 11px;
        }
        .tt-dialog-error {
            min-height: 18px;
            margin-top: 6px;
            color: #ff6b8a;
            font-size: 11px;
        }
        .tt-dialog-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 4px;
        }
        .tt-cancel,
        .tt-confirm {
            padding: 7px 16px;
            border: 1px solid rgba(0, 240, 255, 0.45);
            border-radius: 3px;
            background: rgba(0, 240, 255, 0.06);
            color: #9ffcff;
            font: inherit;
            font-size: 12px;
            letter-spacing: 1px;
            cursor: pointer;
        }
        .tt-confirm {
            border-color: rgba(255, 0, 212, 0.7);
            background: rgba(255, 0, 212, 0.16);
            color: #ffc2f1;
        }
        .tt-cancel:hover {
            background: rgba(0, 240, 255, 0.18);
            color: #fff;
        }
        .tt-confirm:hover {
            background: rgba(255, 0, 212, 0.34);
            color: #fff;
        }
        .tt-ball {
            display: none;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: #9ffcff;
            font: 700 14px/1 'JetBrains Mono', ui-monospace, Consolas, monospace;
            letter-spacing: 1px;
            text-shadow: 0 0 8px rgba(0, 240, 255, 0.9);
            cursor: grab;
            touch-action: none;
        }
        .tt-root.minimized {
            width: 52px;
            height: 52px;
            padding: 2px;
            border-radius: 50%;
            cursor: grab;
        }
        .tt-root.minimized::after {
            border-radius: 50%;
        }
        .tt-root.minimized .tt-head,
        .tt-root.minimized .tt-body,
        .tt-root.minimized .tt-scan {
            display: none;
        }
        .tt-root.minimized .tt-ball {
            display: flex;
        }
        .tt-root.minimized .tt-ball:active {
            cursor: grabbing;
        }
        .tt-root.minimized .tt-ball:hover {
            color: #fff;
        }
    `

    return { html, css: skin }
}
