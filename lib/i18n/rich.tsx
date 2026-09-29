import { Fragment, type ReactNode } from "react";

type Renderers = Record<string, (chunks: ReactNode) => ReactNode>;

/**
 * Renders simple tags in translated strings, so translators can move the
 * emphasis with the words: rich("Power your business on <hl>WhatsApp.</hl>", { hl: (c) => <Highlight>{c}</Highlight> }).
 * Tags are not nested. Unknown tags are rendered as plain text.
 */
export function rich(text: string, renderers: Renderers): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, tag, inner] = match;
    const render = renderers[tag];
    parts.push(<Fragment key={key++}>{render ? render(inner) : inner}</Fragment>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Strips rich-text tags for plain-text contexts (alt text, metadata). */
export function plain(text: string): string {
  return text.replace(/<\/?\w+>/g, "");
}
