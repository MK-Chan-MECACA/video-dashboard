export function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function workerConcurrency(): number {
  const n = Number(process.env.WORKER_CONCURRENCY ?? 3);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

/** Webhook endpoint served by the web app; WaveSpeed calls it on completion. */
export function wavespeedWebhookUrl(): string {
  return `${requiredEnv('APP_URL').replace(/\/$/, '')}/api/webhooks/wavespeed`;
}
