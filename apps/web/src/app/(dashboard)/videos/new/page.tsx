import { redirect } from 'next/navigation';
import { supabaseServer, roleOf } from '@/lib/supabase';
import { resolveDirectionFields } from '@/lib/scriptDirectionPresets';
import AiScriptGenerator from '@/components/AiScriptGenerator';
import NewVideoManualForm from '@/components/NewVideoManualForm';

export const dynamic = 'force-dynamic';

export default async function NewVideoPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && roleOf(user) !== 'operator') redirect('/');
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'script_direction_presets')
    .maybeSingle();
  const fields = resolveDirectionFields(setting?.value);

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="studio-eyebrow mb-2">New video</div>
      <h1 className="mb-6 text-[26px] font-semibold tracking-tight text-studio-bright">New Video</h1>
      <AiScriptGenerator fields={fields} />
      <div className="my-6 flex items-center gap-3 text-xs text-studio-faint">
        <div className="h-px flex-1 bg-studio-border" />
        or create manually
        <div className="h-px flex-1 bg-studio-border" />
      </div>
      <NewVideoManualForm />
    </div>
  );
}
