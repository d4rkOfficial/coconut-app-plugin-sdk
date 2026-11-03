/**
 * 免费模型 OpenAI 兼容服务：/v1/models 与 /v1/chat/completions。
 *
 * 服务由 Coconut.http 打开，监听在 127.0.0.1；工具箱里的 AI 配置把 baseUrl
 * 指到这个端口。所有上游请求走 Coconut.fetch，不再经过启动器的 Rust 代理。
 */
import { SERVER_PORT } from './constants.js';
import { log } from './log.js';
import { authorization, fetchModels, UPSTREAM, upstreamModel } from './models.js';
import { collectStream, transformStream } from './openai.js';

const USER_AGENT = 'opencode/1.19.3';
const READ_TOOL = {
  type: 'function',
  function: {
    name: 'read',
    description: 'Read a file from the local filesystem.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'The absolute path of the file to read.',
        },
      },
      required: ['filePath'],
    },
  },
};

let server = null;
let activePort = 0;

const sessionId = () => {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let tail = '';
  for (let index = 0; index < 20; index += 1) {
    tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ses_${Date.now().toString(16)}${tail}`;
};

const upstreamHeaders = (auth) => {
  const session = sessionId();
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: auth,
    'user-agent': USER_AGENT,
    'x-opencode-session': session,
    'x-opencode-session-id': session,
  };
};

const jsonError = (response, status, message, type = 'invalid_request_error') => {
  response.status(status).json({ error: { message, type } });
};

const modelRequest = (payload) => {
  const raw = String(payload.model || '').split('/').pop();
  return raw.replace(/-free$/, '');
};

const handleModels = (_request, response) => {
  const ids = fetchModels(false);
  response.json({
    object: 'list',
    data: ids.map((id) => ({ id, object: 'model', owned_by: 'opencode' })),
  });
};

const handleChat = (request, response) => {
  let payload;
  try {
    payload = JSON.parse(request.body || '{}');
  } catch {
    jsonError(response, 400, 'invalid JSON body');
    return;
  }
  if (!Array.isArray(payload.messages)) {
    jsonError(response, 400, 'messages must be an array');
    return;
  }

  const requested = modelRequest(payload);
  const ids = fetchModels(false);
  if (!ids.length) {
    jsonError(response, 503, '免费模型列表为空', 'upstream_error');
    return;
  }
  const target = ids.includes(requested) ? requested : ids[0];
  const candidates = [target, ...ids.filter((id) => id !== target)];
  const callerTools = Array.isArray(payload.tools) ? payload.tools : [];
  const hasRead = callerTools.some(
    (tool) => tool && tool.function && tool.function.name === 'read',
  );
  const bridge = !hasRead;
  const tools = callerTools.slice();
  if (bridge) tools.push(READ_TOOL);
  const callerHasTools = callerTools.length > 0;
  const wantsStream = payload.stream === true;
  const auth = authorization(request.headers);

  let lastStatus = 502;
  let lastMessage = '';
  let upstreamBody = '';
  let servedBy = '';

  for (const model of candidates) {
    payload.model = upstreamModel(model);
    payload.stream = true;
    if (tools.length) payload.tools = tools;
    else delete payload.tools;
    if (!callerHasTools && bridge) payload.tool_choice = 'none';

    let upstream;
    try {
      upstream = Coconut.fetch(`${UPSTREAM}/chat/completions`, {
        method: 'POST',
        headers: upstreamHeaders(auth),
        json: payload,
      });
    } catch (error) {
      lastStatus = 502;
      lastMessage = String(error);
      continue;
    }
    if (upstream.ok) {
      upstreamBody = String(upstream.body || '');
      servedBy = model;
      break;
    }
    lastStatus = Number(upstream.status) || 502;
    lastMessage = String(upstream.body || '');
  }

  if (!servedBy) {
    jsonError(
      response,
      lastStatus,
      `All free models failed: ${lastMessage}`,
      'upstream_error',
    );
    return;
  }

  response.header('x-coconut-served-by', servedBy);
  if (servedBy !== requested) response.header('x-coconut-fallback', 'true');
  if (wantsStream) {
    response.header('content-type', 'text/event-stream; charset=utf-8');
    response.header('cache-control', 'no-cache');
    response.end(transformStream(upstreamBody, requested, bridge));
    return;
  }
  response.json(collectStream(upstreamBody, requested, bridge));
};

const handleRequest = (request, response) => {
  if (request.method === 'GET' && request.path === '/v1/models') {
    handleModels(request, response);
    return;
  }
  if (request.method === 'POST' && request.path === '/v1/chat/completions') {
    handleChat(request, response);
    return;
  }
  jsonError(response, 404, `no route for ${request.method} ${request.path}`, 'not_found');
};

/** 启动（幂等）。首选 47830，占用了就退回系统分配端口。 */
export const ensureServer = () => {
  if (server) return server;
  try {
    server = Coconut.http.createServer({ host: '127.0.0.1', port: SERVER_PORT });
  } catch (error) {
    log(`端口 ${SERVER_PORT} 不可用，改用系统分配端口：${error}`);
    server = Coconut.http.createServer({ host: '127.0.0.1', port: 0 });
  }
  server.addEventListener('request', handleRequest);
  activePort = server.port;
  log(`免费模型服务已启动：http://127.0.0.1:${activePort}/v1`);
  return server;
};

/** 当前服务地址；未启动时退回首选端口（配置同步会在这之前确保启动）。 */
export const baseUrl = () => `http://127.0.0.1:${activePort || SERVER_PORT}/v1`;

export const closeServer = () => {
  if (!server) return;
  try {
    server.close();
  } catch (error) {
    log(`关闭免费模型服务失败：${error}`);
  }
  server = null;
  activePort = 0;
};
