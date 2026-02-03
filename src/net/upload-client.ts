import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { URL } from 'url';

export type UploadRequest = {
  url: string;
  filePath: string;
  fieldName?: string;
  filename?: string;
  mime?: string;
  headers?: Record<string, string>;
  fields?: Record<string, any>;
  timeoutMs?: number;
  onProgress?: (sent: number, total: number) => void;
};

export type UploadResponse = {
  statusCode: number;
  headers: Record<string, any>;
  body: string;
  json?: any;
};

function isGzip(headers: Record<string, any>) {
  const encoding = headers?.['content-encoding'] || headers?.['Content-Encoding'];
  if (!encoding) return false;
  return String(encoding).toLowerCase().includes('gzip');
}

function toBuffer(input: string) {
  return Buffer.from(input, 'utf-8');
}

function collectFieldBuffers(fields: Record<string, any>, boundary: string) {
  const buffers: Buffer[] = [];
  if (!fields) return buffers;

  const pushField = (key: string, value: any) => {
    const content = value === undefined || value === null ? '' : String(value);
    const part = `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${key}"\r\n\r\n`
      + `${content}\r\n`;
    buffers.push(toBuffer(part));
  };

  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) pushField(key, item);
    } else {
      pushField(key, value);
    }
  }

  return buffers;
}

export function uploadMultipartFile(opts: UploadRequest): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err?: Error, res?: UploadResponse) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(res as UploadResponse);
    };

    if (!opts?.url) {
      done(new Error('upload url is required'));
      return;
    }

    if (!opts?.filePath) {
      done(new Error('filePath is required'));
      return;
    }

    if (!fs.existsSync(opts.filePath)) {
      done(new Error(`file not found: ${opts.filePath}`));
      return;
    }

    let fileStat: fs.Stats;
    try {
      fileStat = fs.statSync(opts.filePath);
    } catch (err) {
      done(err as Error);
      return;
    }

    const boundary = `----KakaoForge${crypto.randomBytes(8).toString('hex')}`;
    const fieldName = opts.fieldName || 'file_1';
    const filename = opts.filename || path.basename(opts.filePath);
    const mime = opts.mime || 'application/octet-stream';

    const fieldBuffers = collectFieldBuffers(opts.fields || {}, boundary);
    const fileHeader = `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`
      + `Content-Type: ${mime}\r\n\r\n`;
    const fileHeaderBuf = toBuffer(fileHeader);
    const fileFooterBuf = toBuffer('\r\n');
    const closingBuf = toBuffer(`--${boundary}--\r\n`);

    const totalLength = fieldBuffers.reduce((sum, buf) => sum + buf.length, 0)
      + fileHeaderBuf.length
      + fileStat.size
      + fileFooterBuf.length
      + closingBuf.length;

    let url: URL;
    try {
      url = new URL(opts.url);
    } catch {
      done(new Error(`invalid upload url: ${opts.url}`));
      return;
    }

    const isHttps = url.protocol === 'https:';
    const request = (isHttps ? https : http).request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port ? Number(url.port) : (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLength,
        'Accept': '*/*',
        ...opts.headers,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      const stream = isGzip(res.headers as Record<string, any>) ? res.pipe(zlib.createGunzip()) : res;
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('error', (err) => done(err as Error));
      stream.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        let json: any;
        try {
          json = JSON.parse(body);
        } catch {
          json = undefined;
        }
        const response: UploadResponse = {
          statusCode: res.statusCode || 0,
          headers: res.headers as Record<string, any>,
          body,
          json,
        };
        if (response.statusCode < 200 || response.statusCode >= 300) {
          done(new Error(`upload failed: status=${response.statusCode} body=${body}`));
          return;
        }
        done(undefined, response);
      });
    });

    request.on('error', (err) => done(err as Error));
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      request.setTimeout(opts.timeoutMs, () => {
        request.destroy(new Error('upload timed out'));
      });
    }

    let sent = 0;
    const reportProgress = () => {
      if (opts.onProgress) {
        opts.onProgress(sent, totalLength);
      }
    };
    const writeBuffer = (buf: Buffer) => {
      if (!buf || buf.length === 0) return;
      request.write(buf);
      sent += buf.length;
      reportProgress();
    };

    for (const buf of fieldBuffers) {
      writeBuffer(buf);
    }

    writeBuffer(fileHeaderBuf);

    const stream = fs.createReadStream(opts.filePath);
    stream.on('data', (chunk) => {
      sent += chunk.length;
      reportProgress();
    });
    stream.on('error', (err) => {
      request.destroy();
      done(err as Error);
    });
    stream.on('end', () => {
      writeBuffer(fileFooterBuf);
      writeBuffer(closingBuf);
      request.end();
    });

    stream.pipe(request, { end: false });
  });
}

