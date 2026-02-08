import * as path from 'path';
import { spawn, spawnSync } from 'child_process';

export type VideoProbe = {
  width: number;
  height: number;
  bitrate: number;
  duration: number;
  rotation: number;
};

export function resolveFfmpegBinary(name: 'ffmpeg' | 'ffprobe', opts: { ffmpegPath?: string; ffprobePath?: string } = {}) {
  const envFfmpeg = process.env.KAKAOFORGE_FFMPEG_PATH || process.env.FFMPEG_PATH || '';
  const envFfprobe = process.env.KAKAOFORGE_FFPROBE_PATH || process.env.FFPROBE_PATH || '';
  if (name === 'ffmpeg') {
    return opts.ffmpegPath || envFfmpeg || 'ffmpeg';
  }
  const direct = opts.ffprobePath || envFfprobe;
  if (direct) return direct;
  const ffmpegPath = opts.ffmpegPath || envFfmpeg;
  if (ffmpegPath) {
    const ext = path.extname(ffmpegPath);
    const probeName = ext ? `ffprobe${ext}` : 'ffprobe';
    return path.join(path.dirname(ffmpegPath), probeName);
  }
  return 'ffprobe';
}

export function assertBinaryAvailable(binPath: string, label: string) {
  const res = spawnSync(binPath, ['-version'], { windowsHide: true, stdio: 'ignore' });
  if (res.error || res.status !== 0) {
    throw new Error(`${label} not found. Install ffmpeg and ensure it is in PATH, or pass ${label.toLowerCase()}Path.`);
  }
}

export function probeVideo(filePath: string, ffprobePath: string): VideoProbe {
  const res = spawnSync(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,bit_rate,rotation,codec_type,codec_name:format=duration,bit_rate',
    '-of', 'json',
    filePath,
  ], { windowsHide: true, encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    const errMsg = res.stderr ? String(res.stderr).trim() : 'ffprobe failed';
    throw new Error(`ffprobe failed: ${errMsg}`);
  }
  let data: any = {};
  try {
    data = JSON.parse(res.stdout || '{}');
  } catch {
    data = {};
  }
  const stream = Array.isArray(data.streams)
    ? data.streams.find((s: any) => s && s.codec_type === 'video')
    : null;
  const width = Number(stream?.width || 0);
  const height = Number(stream?.height || 0);
  const rotation = Number(stream?.rotation ?? stream?.tags?.rotate ?? 0);
  const streamBitrate = Number(stream?.bit_rate || 0);
  const formatBitrate = Number(data.format?.bit_rate || 0);
  const bitrate = Number.isFinite(streamBitrate) && streamBitrate > 0
    ? streamBitrate
    : (Number.isFinite(formatBitrate) ? formatBitrate : 0);
  const duration = Number(data.format?.duration || 0);
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
    bitrate: Number.isFinite(bitrate) ? bitrate : 0,
    duration: Number.isFinite(duration) ? duration : 0,
    rotation: Number.isFinite(rotation) ? rotation : 0,
  };
}

export function toEven(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 2;
  const floored = Math.floor(value);
  return floored % 2 === 0 ? floored : floored - 1;
}

export function computeTargetVideoSize(meta: VideoProbe, resolution: number) {
  let width = meta.width;
  let height = meta.height;
  if (meta.rotation === 90 || meta.rotation === 270) {
    width = meta.height;
    height = meta.width;
  }
  if (resolution && resolution > 0) {
    const shortSide = Math.min(width, height);
    if (shortSide >= resolution + 1) {
      const scale = resolution / shortSide;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
  }
  return { width: toEven(width), height: toEven(height) };
}

export function runProcess(binPath: string, args: string[], timeoutMs = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, args, { windowsHide: true });
    const stderr: Buffer[] = [];
    const timer = timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          proc.kill();
          reject(new Error(`${binPath} timed out`));
        }, timeoutMs)
      : null;
    proc.stderr?.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const message = Buffer.concat(stderr).toString('utf8').trim();
        reject(new Error(message || `${binPath} failed with code ${code}`));
      }
    });
  });
}

export function hasTrailerProfile(conf: any) {
  const trailerInfo = conf?.trailerInfo || {};
  const trailerHighInfo = conf?.trailerHighInfo || {};
  const base = Object.keys(trailerHighInfo).length ? trailerHighInfo : trailerInfo;
  const bitrate = Number(base?.videoTranscodingBitrate || 0);
  const resolution = Number(base?.videoTranscodingResolution || 0);
  return Number.isFinite(bitrate) && bitrate > 0 && Number.isFinite(resolution) && resolution > 0;
}

export function summarizeTrailerKeys(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const keys = Object.keys(raw);
  const trailerKeys = keys.filter((k) => /trailer|transcod|video/i.test(k));
  if (trailerKeys.length === 0) return null;
  const summary: Record<string, any> = {};
  for (const key of trailerKeys) {
    const value = raw[key];
    if (value && typeof value === 'object') {
      summary[key] = Array.isArray(value) ? `array(${value.length})` : Object.keys(value);
    } else {
      summary[key] = value;
    }
  }
  return summary;
}
