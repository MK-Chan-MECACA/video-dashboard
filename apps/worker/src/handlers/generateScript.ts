import type { Job } from '@vd/shared';
import { completeJob } from '../db';

/**
 * Script generation happens synchronously in the web app (it needs the
 * result in the request/response cycle), so this job type is a no-op kept
 * only so a stray enqueue never wedges the queue.
 */
export async function handleGenerateScript(job: Job): Promise<void> {
  console.log(`[generate_script] no-op (handled by web app); marking ${job.id} succeeded`);
  await completeJob(job.id);
}
