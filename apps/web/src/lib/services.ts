import { HeyGenClient, GhlClient, R2Client, WaveSpeedClient, r2ConfigFromEnv } from '@vd/shared';

export function r2(): R2Client {
  return new R2Client(r2ConfigFromEnv());
}

export function heygen(): HeyGenClient {
  return new HeyGenClient(process.env.HEYGEN_API_KEY!);
}

export function wavespeed(): WaveSpeedClient {
  return new WaveSpeedClient(process.env.WAVESPEED_API_KEY!);
}

export function ghl(): GhlClient {
  return new GhlClient(process.env.GHL_PRIVATE_TOKEN!, process.env.GHL_LOCATION_ID!);
}

export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}
