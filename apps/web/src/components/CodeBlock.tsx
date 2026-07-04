'use client';

import { useState } from 'react';

/** Dark code block with a copy button, used on the API & MCP docs page. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      {label && <p className="mb-1 text-xs text-neutral-500">{label}</p>}
      <pre className="overflow-x-auto rounded border border-neutral-800 bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-200">
        <code>{code}</code>
      </pre>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
        style={label ? { top: '1.5rem' } : undefined}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}
