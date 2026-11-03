/**
 * opencode 的 SSE 响应转换：隐藏托管的 read 工具、把模型名换回调用方看到的名字。
 *
 * 上游强制 stream=true，所以非流式请求也要先把 SSE 收集成 chat.completion。
 * QuickJS 没有 ReadableStream，Coconut.fetch 会等整段 body 读完再返回，这里一次性解析。
 */

const blocks = (body) => {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const out = [];
  let rest = text;
  while (true) {
    const index = rest.indexOf('\n\n');
    if (index < 0) break;
    out.push(rest.slice(0, index));
    rest = rest.slice(index + 2);
  }
  if (rest.trim()) out.push(rest);
  return out;
};

const eventData = (block) =>
  block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');

/** 返回一个带状态的转换器，stream / collect 共用同一套过滤逻辑。 */
const transformer = (requested, stripRead) => {
  const suppressed = new Set();
  let callerToolCall = false;
  return (event) => {
    if (event && typeof event === 'object' && event.model !== undefined) event.model = requested;
    const choices = Array.isArray(event && event.choices) ? event.choices : [];
    for (const choice of choices) {
      const finish = String(choice.finish_reason || '');
      const delta = choice.delta;
      if (delta && Array.isArray(delta.tool_calls)) {
        const kept = [];
        for (const call of delta.tool_calls) {
          const index = Number(call.index || 0);
          const name = call.function && call.function.name ? String(call.function.name) : '';
          if (stripRead && name === 'read') {
            suppressed.add(index);
            continue;
          }
          if (suppressed.has(index)) continue;
          callerToolCall = true;
          kept.push(call);
        }
        if (kept.length) delta.tool_calls = kept;
        else delete delta.tool_calls;
      }
      if (finish === 'tool_calls' && !callerToolCall) choice.finish_reason = 'stop';
    }
    return event;
  };
};

export const transformStream = (body, requested, stripRead) => {
  const transform = transformer(requested, stripRead);
  let out = '';
  let done = false;
  for (const block of blocks(body)) {
    const data = eventData(block);
    if (!data) continue;
    if (data === '[DONE]') {
      out += 'data: [DONE]\n\n';
      done = true;
      break;
    }
    try {
      out += `data: ${JSON.stringify(transform(JSON.parse(data)))}\n\n`;
    } catch (error) {
      Coconut.log('跳过无法解析的 SSE 事件：', String(error));
    }
  }
  if (!done) out += 'data: [DONE]\n\n';
  return out;
};

export const collectStream = (body, requested, stripRead) => {
  const transform = transformer(requested, stripRead);
  let content = '';
  let reasoning = '';
  let finish = 'stop';
  let usage = null;
  const calls = new Map();

  for (const block of blocks(body)) {
    const data = eventData(block);
    if (!data || data === '[DONE]') continue;
    let event;
    try {
      event = transform(JSON.parse(data));
    } catch (error) {
      continue;
    }
    if (event.usage) usage = event.usage;
    for (const choice of Array.isArray(event.choices) ? event.choices : []) {
      const delta = choice.delta || {};
      if (typeof delta.content === 'string') content += delta.content;
      if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
      for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const index = Number(call.index || 0);
        const entry = calls.get(index) || {
          id: call.id || '',
          type: 'function',
          function: { name: '', arguments: '' },
        };
        const fn = call.function || {};
        if (fn.name && !entry.function.name) entry.function.name = String(fn.name);
        if (typeof fn.arguments === 'string') entry.function.arguments += fn.arguments;
        calls.set(index, entry);
      }
      if (choice.finish_reason) finish = String(choice.finish_reason);
    }
  }

  const toolCalls = Array.from(calls.entries())
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1]);
  const message = toolCalls.length
    ? { role: 'assistant', content: null, reasoning_content: reasoning, tool_calls: toolCalls }
    : { role: 'assistant', content, reasoning_content: reasoning };
  return {
    id: `chatcmpl-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: requested,
    choices: [{ index: 0, message, finish_reason: finish }],
    usage,
  };
};
