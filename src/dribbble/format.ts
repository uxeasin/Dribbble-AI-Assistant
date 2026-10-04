// Turns the plain-text description into structured rich text for Dribbble's
// text block: bold section titles, separate paragraphs and bullet lines.
//
// Plain-text convention (also what the AI is asked to write, and what the
// designer edits in the side panel):
//   - Blocks are separated by a blank line.
//   - A block whose first line is a short title (no ending punctuation) and
//     that has more lines below it starts with a section title.
//   - Lines starting with "•", "-" or "*" are bullet points.

export type DescriptionBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string };

const BULLET = /^\s*[•\-*]\s+/;
const MAX_HEADING_LENGTH = 60;

function isHeadingLine(line: string): boolean {
  const text = line.trim();
  return (
    text.length > 0 &&
    text.length <= MAX_HEADING_LENGTH &&
    !BULLET.test(text) &&
    !/[.!?,;:]$/.test(text) &&
    text.split(/\s+/).length <= 8
  );
}

export function parseDescription(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const chunk of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    if (lines.length > 1 && isHeadingLine(lines[0]!)) {
      blocks.push({ kind: 'heading', text: lines.shift()!.replace(/^#+\s*/, '') });
    }

    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    };
    for (const line of lines) {
      if (BULLET.test(line)) {
        flush();
        blocks.push({ kind: 'bullet', text: line.replace(BULLET, '') });
      } else {
        paragraph.push(line);
      }
    }
    flush();
  }
  return blocks;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Section titles are bold paragraphs rather than <h2>: Dribbble's heading
 * styles apply to a whole block, while bold is supported inside a text block.
 * Bullets are paragraphs starting with "•" so they survive editors without lists.
 */
export function blockToHtml(block: DescriptionBlock): string {
  const text = escapeHtml(block.text);
  if (block.kind === 'heading') return `<p><strong>${text}</strong></p>`;
  if (block.kind === 'bullet') return `<p>• ${text}</p>`;
  return `<p>${text}</p>`;
}

export function blockToText(block: DescriptionBlock): string {
  return block.kind === 'bullet' ? `• ${block.text}` : block.text;
}

export function descriptionToHtml(text: string): string {
  return parseDescription(text).map(blockToHtml).join('');
}

/** Plain-text rendering with one block per line, matching what the editor shows. */
export function descriptionToPlainText(text: string): string {
  return parseDescription(text).map(blockToText).join('\n\n');
}
