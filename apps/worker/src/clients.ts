import {
  GhlClient,
  HeyGenClient,
  R2Client,
  WaveSpeedClient,
  r2ConfigFromEnv,
} from '@vd/shared';
import { requiredEnv } from './env';

let _r2: R2Client | undefined;
let _heygen: HeyGenClient | undefined;
let _wavespeed: WaveSpeedClient | undefined;
let _ghl: GhlClient | undefined;

export const r2 = (): R2Client => (_r2 ??= new R2Client(r2ConfigFromEnv()));

export const heygen = (): HeyGenClient =>
  (_heygen ??= new HeyGenClient(requiredEnv('HEYGEN_API_KEY')));

export const wavespeed = (): WaveSpeedClient =>
  (_wavespeed ??= new WaveSpeedClient(requiredEnv('WAVESPEED_API_KEY')));

export const ghl = (): GhlClient =>
  (_ghl ??= new GhlClient(requiredEnv('GHL_PRIVATE_TOKEN'), requiredEnv('GHL_LOCATION_ID')));
