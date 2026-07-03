import { spawn } from 'node:child_process';

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        // code=null means killed by a signal — SIGKILL here is almost always
        // the container OOM-killer reaping ffmpeg.
        const cause =
          code === null
            ? `killed by ${signal ?? 'unknown signal'}${signal === 'SIGKILL' ? ' (likely out of memory — raise worker instance memory)' : ''}`
            : `exited with code ${code}`;
        reject(
          new Error(
            `${cmd} ${cause}\ncommand: ${cmd} ${args.join(' ')}\nstderr tail:\n${stderr.slice(-2000)}`,
          ),
        );
      }
    });
  });
}

export async function runFfmpeg(args: string[]): Promise<void> {
  await run('ffmpeg', args);
}

/** Pixel dimensions of the first video stream (works for images too). */
export async function probeDimensions(path: string): Promise<{ width: number; height: number }> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-print_format', 'json',
    '-show_entries', 'stream=width,height',
    path,
  ]);
  const json = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[] };
  const s = json.streams?.[0];
  if (!s?.width || !s?.height) throw new Error(`ffprobe: no dimensions for ${path}`);
  return { width: s.width, height: s.height };
}

/** Codec name of the first video stream, e.g. "h264" or "hevc". */
export async function probeVideoCodec(path: string): Promise<string> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-print_format', 'json',
    '-show_entries', 'stream=codec_name',
    path,
  ]);
  const json = JSON.parse(stdout) as { streams?: { codec_name?: string }[] };
  const codec = json.streams?.[0]?.codec_name;
  if (!codec) throw new Error(`ffprobe: no video stream in ${path}`);
  return codec;
}

export async function probeDurationS(path: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    path,
  ]);
  const json = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: { duration?: string }[];
  };
  const d = Number(json.format?.duration ?? json.streams?.[0]?.duration ?? NaN);
  if (!Number.isFinite(d) || d <= 0) throw new Error(`ffprobe: no duration for ${path}`);
  return d;
}
