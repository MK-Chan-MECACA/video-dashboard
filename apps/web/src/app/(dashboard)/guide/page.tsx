import Link from 'next/link';

export const metadata = { title: 'How to use' };

const SECTIONS: { id: string; n: number; title: string }[] = [
  { id: 'setup', n: 1, title: 'One-time setup' },
  { id: 'board', n: 2, title: 'Reading the board' },
  { id: 'create', n: 3, title: 'Create a video' },
  { id: 'script', n: 4, title: 'Polish the script' },
  { id: 'script-review', n: 5, title: 'Script review' },
  { id: 'generation', n: 6, title: 'Automatic generation' },
  { id: 'video-review', n: 7, title: 'Video review' },
  { id: 'posting', n: 8, title: 'Caption & posting' },
  { id: 'fixing', n: 9, title: 'When things go wrong' },
  { id: 'statuses', n: 10, title: 'Status reference' },
];

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 space-y-3 rounded-[12px] border border-studio-border bg-studio-card p-5"
    >
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-studio-bright">
        <span className="rounded-[5px] bg-studio-accent px-1.5 text-xs font-bold text-studio-on-accent">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Btn({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-[5px] border border-studio-accent/40 bg-studio-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-studio-accent">
      {children}
    </span>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[6px] border-l-2 border-studio-accent bg-studio-inset/60 px-3 py-2 text-xs text-studio-sub">
      <span className="mr-1 font-semibold uppercase tracking-wide text-studio-accent">{label}</span>
      {children}
    </div>
  );
}

const P = 'text-xs leading-relaxed text-studio-sub';
const LI = 'text-xs leading-relaxed text-studio-sub';

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-[820px] space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-studio-bright">How to use this dashboard</h1>
        <p className="mt-1.5 text-sm text-studio-sub">
          From idea to posted TikTok: you create the video and polish the script, a reviewer
          approves via magic link, the pipeline generates voiceover, avatar, B-roll and the final
          render automatically, and the post is scheduled for you.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 text-xs">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-studio-border-strong px-2.5 py-1 text-studio-sub hover:border-studio-accent hover:text-studio-accent"
          >
            {s.n} · {s.title}
          </a>
        ))}
      </nav>

      <Section id="setup" n={1} title="One-time setup — before your first video">
        <p className={P}>
          Everything brand-specific lives in{' '}
          <Link href="/settings" className="text-studio-accent hover:underline">
            Settings
          </Link>
          . Generation refuses to run until the four brand assets exist:
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li className={LI}>
            <b className="text-studio-bright">Brand name</b> — shown in the header, favicon and
            client review pages.
          </li>
          <li className={LI}>
            <b className="text-studio-bright">Brand assets</b> — avatar reference (silent
            talking-pose video of the presenter), transparent logo PNG, 1080×1920 outro card, and
            BGM MP3. Mark one of each as default.
          </li>
          <li className={LI}>
            <b className="text-studio-bright">HeyGen voice</b> — press{' '}
            <Btn>Load English voices</Btn>, pick one, save.
          </li>
          <li className={LI}>
            <b className="text-studio-bright">Script prompt</b> — fill in the ABOUT YOUR BRAND
            block (presenter, audience, offer, boundaries). Biggest lever on script quality.
          </li>
          <li className={LI}>
            <b className="text-studio-bright">Caption prompt</b> — your hashtags and local tags.
          </li>
          <li className={LI}>
            <b className="text-studio-bright">Video layout</b> — optional: logo position, subtitle
            size, presenter bubble. Defaults are sensible.
          </li>
        </ul>
      </Section>

      <Section id="board" n={2} title="Reading the pipeline board">
        <p className={P}>
          The board shows every video left to right in production order: Scripting → Script Review
          → Generating → Rendering → Video Review → Scheduled → Posted, plus Failed. Click a card
          to open it. Filter by number (V4 or 4) or title; drag a card to move it manually —
          only legal moves are allowed, and most moves happen automatically anyway.
        </p>
      </Section>

      <Section id="create" n={3} title="Create a video">
        <p className={P}>
          Press <Btn>+ New Video</Btn>, give it a working title (internal only) and a topic brief
          (one or two sentences on what the video should say), then press{' '}
          <Btn>Create + Generate Script</Btn>. Claude writes a hook, 3 scenes (spoken lines +
          B-roll visual prompt each) and a CTA. Or press <Btn>Create empty</Btn> to write the
          script yourself.
        </p>
      </Section>

      <Section id="script" n={4} title="Polish the script">
        <p className={P}>
          Open the video → <Btn>Open script editor</Btn>. Three ways to improve a draft:
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li className={LI}>
            <b className="text-studio-bright">Edit by hand</b>, then <Btn>Save as new version</Btn> —
            old versions are kept in Version history.
          </li>
          <li className={LI}>
            <b className="text-studio-bright">Revise with Claude</b> — type instructions
            (&ldquo;make the hook more controversial&rdquo;) and press{' '}
            <Btn>Regenerate (revise current)</Btn>. Unresolved reviewer comments are included
            automatically.
          </li>
          <li className={LI}>
            <b className="text-studio-bright">Start over</b> — <Btn>Regenerate from scratch</Btn>{' '}
            ignores the current draft.
          </li>
        </ul>
        <p className={P}>
          B-roll prompts aren&rsquo;t spoken — they describe the visuals to generate. Be concrete:
          setting, subject, camera. When happy, press <Btn>Save + Send for review</Btn>.
        </p>
      </Section>

      <Section id="script-review" n={5} title="Get the script approved (magic links)">
        <p className={P}>
          On the video page press <Btn>Create script review link</Btn> (copied to clipboard) and
          send it to the reviewer — WhatsApp is fine, no login needed. They can comment on each
          section and press Approve or Request changes. Approval starts the pipeline; change
          requests send the card back to Scripting with the comments shown in your script editor.
        </p>
        <Tip label="Approving it yourself">
          Still use the link: create it, open it in a tab, press Approve. Approval through the
          link is what queues the next pipeline job — dragging the card only relabels it and
          nothing will run.
        </Tip>
        <Tip label="Links expire">
          Review links last 14 days and are shown once. If one is lost, just create a new link.
          The Approve button only appears while the video is actually in review — if the page
          says &ldquo;not currently awaiting review&rdquo;, send it for review first, then reload.
        </Tip>
      </Section>

      <Section id="generation" n={6} title="Automatic generation — what happens while you wait">
        <p className={P}>
          After script approval the worker runs on its own: voiceover (HeyGen TTS with word
          timestamps) → avatar (your presenter speaking) → 3 B-roll clips (one per scene) → final
          1080×1920 render with logo, burned-in subtitles, presenter bubble, BGM and outro. The
          avatar is the slow step. Watch progress in the Jobs panel; each asset appears on the
          video page as it finishes.
        </p>
      </Section>

      <Section id="video-review" n={7} title="Review the final video">
        <p className={P}>
          Watch the final video yourself first. While it&rsquo;s in review you can redo parts
          surgically without regenerating everything:
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li className={LI}>
            <Btn>Regen scene 1/2/3</Btn> — redo one B-roll clip (tweak its prompt first if
            needed).
          </li>
          <li className={LI}>
            <Btn>Regenerate avatar</Btn> — redo the presenter footage, same voiceover.
          </li>
          <li className={LI}>
            <Btn>Re-render</Btn> — recomposite with current layout settings; free, no
            regeneration.
          </li>
        </ul>
        <p className={P}>
          Then press <Btn>Create video review link</Btn> and share it — same approve flow as the
          script.
        </p>
      </Section>

      <Section id="posting" n={8} title="Caption & posting to TikTok">
        <p className={P}>
          On final approval, Claude writes the TikTok caption and the post is scheduled via
          GoHighLevel for 7 PM (MYT) the next day. To override either, edit the caption box or the
          schedule picker on the video page and press <Btn>Save caption &amp; schedule</Btn>{' '}
          before the posting time. The card moves to Posted once it&rsquo;s live.
        </p>
        <Tip label="First post">
          Verify your first post actually publishes — personal TikTok profiles may require
          confirming from the phone (notification-based posting).
        </Tip>
      </Section>

      <Section id="fixing" n={9} title="When things go wrong">
        <p className={P}>
          Errors send the card to Failed with the message on the card and the video page. Open the
          video, read the error and the Jobs panel, then press <Btn>Retry failed jobs</Btn>. Most
          transient API failures pass on retry. If it fails the same way twice, the cause is
          usually upstream — a missing brand asset, an account out of credits, or a disconnected
          TikTok account. Fix that, then retry. The Timeline panel lists the last 30 events for
          the video.
        </p>
      </Section>

      <Section id="statuses" n={10} title="Status reference">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-studio-border font-mono text-[10px] uppercase tracking-wide text-studio-muted">
                <th className="py-1.5 pr-4 font-medium">Column</th>
                <th className="py-1.5 pr-4 font-medium">Who acts</th>
                <th className="py-1.5 font-medium">What to do</th>
              </tr>
            </thead>
            <tbody className="text-studio-sub">
              {(
                [
                  ['Scripting', 'You', 'Write / regenerate the script, then send for review'],
                  ['Script Review', 'Reviewer', 'Send the script review link, wait for a decision'],
                  ['Generating', 'Nobody', 'Wait — watch the Jobs panel'],
                  ['Rendering', 'Nobody / You', 'Wait, or regen scenes / avatar / re-render'],
                  ['Video Review', 'Reviewer', 'Send the video review link, wait for a decision'],
                  ['Scheduled', 'Optional you', 'Adjust caption or schedule time before it posts'],
                  ['Posted', 'Nobody', 'Done — live on TikTok'],
                  ['Failed', 'You', 'Read the error, fix the cause, retry failed jobs'],
                ] as const
              ).map(([col, who, what]) => (
                <tr key={col} className="border-b border-studio-border/60">
                  <td className="py-1.5 pr-4 whitespace-nowrap text-studio-bright">{col}</td>
                  <td className="py-1.5 pr-4 whitespace-nowrap">{who}</td>
                  <td className="py-1.5">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
