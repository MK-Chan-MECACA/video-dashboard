'use client';

import { useState } from 'react';

/** Dark code block with a copy button, used on the API & MCP docs page. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      {label && <p className="mb-1 text-xs text-studio-muted">{label}</p>}
      <pre className="overflow-x-auto rounded-[8px] border border-studio-border bg-studio-code p-3 font-mono text-xs leading-relaxed text-studio-text">
        <code>{code}</code>
      </pre>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-[6px] border border-studio-border-strong bg-studio-card px-2 py-0.5 text-[10px] text-studio-muted opacity-0 transition-opacity hover:text-studio-bright group-hover:opacity-100"
        style={label ? { top: '1.5rem' } : undefined}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}
