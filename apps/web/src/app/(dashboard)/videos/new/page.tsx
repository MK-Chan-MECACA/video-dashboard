import { supabaseServer } from '@/lib/supabase';
import { resolveDirectionFields } from '@/lib/scriptDirectionPresets';
import AiScriptGenerator from '@/components/AiScriptGenerator';
import NewVideoManualForm from '@/components/NewVideoManualForm';

export const dynamic = 'force-dynamic';

export default async function NewVideoPage() {
  const supabase = await supabaseServer();
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'script_direction_presets')
    .maybeSingle();
  const fields = resolveDirectionFields(setting?.value);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">New Video</h1>
      <AiScriptGenerator fields={fields} />
      <div className="my-6 flex items-center gap-3 text-xs text-neutral-600">
        <div className="h-px flex-1 bg-neutral-800" />
        or create manually
        <div className="h-px flex-1 bg-neutral-800" />
      </div>
      <NewVideoManualForm />
    </div>
  );
}
