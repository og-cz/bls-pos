import type { ReactNode } from 'react';

// A small Markdown subset for the bundled help articles (Section 8.3): ## headings,
// paragraphs, "- " and "1. " lists and **bold**. Rendered as React elements, never as
// HTML, so nothing in an article can run as code.

function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}

type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.trim().split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim());
    const first = lines[0] ?? '';
    if (first.startsWith('## ')) {
      blocks.push({ kind: 'h', text: first.slice(3) });
    } else if (lines.every((l) => l.startsWith('- '))) {
      blocks.push({ kind: 'ul', items: lines.map((l) => l.slice(2)) });
    } else if (lines.every((l) => /^\d+\. /.test(l))) {
      blocks.push({ kind: 'ol', items: lines.map((l) => l.replace(/^\d+\. /, '')) });
    } else {
      blocks.push({ kind: 'p', text: lines.join(' ') });
    }
  }
  return blocks;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-3 leading-relaxed">
      {parse(source).map((b, i) => {
        if (b.kind === 'h') {
          return (
            <h2 key={i} className="pt-2 text-lg font-semibold">
              {b.text}
            </h2>
          );
        }
        if (b.kind === 'p') return <p key={i}>{inline(b.text)}</p>;
        const List = b.kind === 'ul' ? 'ul' : 'ol';
        return (
          <List
            key={i}
            className={b.kind === 'ul' ? 'list-disc space-y-1 pl-6' : 'list-decimal space-y-1 pl-6'}
          >
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
