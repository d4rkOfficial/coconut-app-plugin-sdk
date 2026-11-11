/**
 * 插件测试：`deno task test <id>` 会先打包，再在「假宿主 + 假页面」里跑这个文件。
 *
 *   - 断言用 `t.check('说明', 条件)`，失败的会汇总并以非 0 退出；
 *   - `plugin` 是加载后的插件，能看 `logs` / `overlays` / `hooks` / `stored` / `runJsCodes`…；
 *   - 需要假工具箱 / 假网络时，给 runPluginTests 传第三个参数：
 *       { engine: { callTool(name, args) { … }, fetch(url, opts) { … } } }
 *   - `t.lifecycle('hello')` 会同时触发全局钩子和 Coconut.addEventListener 注册的监听器。
 */
import { runPluginTests } from '../../tests/harness.ts'

// 插件 id = 目录名（dev/<id>/test.js）
const id = import.meta.dirname.replace(/[\\/]/g, '/').split('/').pop()

await runPluginTests(id, async (t, plugin) => {
    await t.lifecycle('start')
    t.check('start 写了加载日志', plugin.logs.some((line) => line.includes(id)))

    await t.lifecycle('hello')
    t.check('hello 调用了页面脚本', plugin.runJsCodes.length > 0)
    t.check('hello 写下了页面标题日志', plugin.logs.some((line) => line.includes('页面标题')))

    await t.lifecycle('bye')
    await t.lifecycle('stop')
    t.check('stop 后没有残留浮层', plugin.removedOverlays.length === 0)
})
