import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { parseSettingsDocument, settingsDocument } from '../src/settings-store.ts';

const MAX_BYTES = 16 * 1024;

/** Fixed target path and atomic replacement: failed saves cannot truncate the previous JSON. */
export function settingsMiddleware(file: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0];
    if (url !== '/__save-params' && url !== '/params.json') return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    if (url === '/params.json' && req.method === 'GET') {
      void readFile(file, 'utf8').then(raw => {
        send(200, settingsDocument(parseSettingsDocument(JSON.parse(raw))));
      }).catch(() => send(500, { ok: false, error: '读取 params.json 失败' }));
      return;
    }
    if (url !== '/__save-params' || req.method !== 'POST') {
      send(405, { ok: false, error: '请求方法不受支持' }); return;
    }
    // Requests from both LAN HTTPS and localhost work; foreign web origins cannot write files.
    if (req.headers.origin) {
      try {
        // HTTPS Vite can use HTTP/2, which supplies :authority instead of Host.
        const authority = req.headers[':authority'] ?? req.headers.host;
        if (new URL(req.headers.origin).host !== authority) throw new Error();
      } catch { send(403, { ok: false, error: '只允许从当前项目页面保存' }); return; }
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      send(415, { ok: false, error: '保存内容必须是 JSON' }); return;
    }
    void (async () => {
      let raw = '', size = 0;
      try {
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > MAX_BYTES) { send(413, { ok: false, error: '参数文件过大' }); return; }
          raw += chunk.toString();
        }
      } catch { if (!res.destroyed) send(400, { ok: false, error: '未能完整接收参数' }); return; }
      let settings;
      try { settings = parseSettingsDocument(JSON.parse(raw), true); }
      catch (error) { send(400, { ok: false, error: error instanceof Error ? error.message : '参数无效' }); return; }
      const temp = join(dirname(file), `.params-${randomUUID()}.tmp`);
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(temp, `${JSON.stringify(settingsDocument(settings), null, 2)}\n`, 'utf8');
        await rename(temp, file);
        send(200, { ok: true });
      } catch {
        await rm(temp, { force: true }).catch(() => {});
        send(500, { ok: false, error: '无法写入 params.json，请检查项目目录写入权限' });
      }
    })();
  };
}

export function jsonSettingsPlugin(file: string): Plugin {
  return {
    name: 'archero-json-settings',
    configureServer(server) { server.middlewares.use(settingsMiddleware(file)); },
    configurePreviewServer(server) { server.middlewares.use(settingsMiddleware(file)); },
  };
}
