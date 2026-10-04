import { describe, expect, it } from 'vitest';
import { descriptionToHtml, descriptionToPlainText, parseDescription } from '../../src/dribbble/format';

const DESCRIPTION = `This is a mobile app UI design for an electric scooter rental service. It helps riders find and unlock scooters quickly.

The Challenge
Riders need to find a nearby scooter, check its battery and start a ride in seconds.

Key Screens
• Home map with nearby scooters
• Scooter details with battery level
- Active ride with live timer

Visual Language
A dark interface with teal accents keeps the map and ride data readable outdoors.`;

describe('description formatting', () => {
  it('parses intro, section titles, paragraphs and bullets', () => {
    expect(parseDescription(DESCRIPTION)).toEqual([
      { kind: 'paragraph', text: 'This is a mobile app UI design for an electric scooter rental service. It helps riders find and unlock scooters quickly.' },
      { kind: 'heading', text: 'The Challenge' },
      { kind: 'paragraph', text: 'Riders need to find a nearby scooter, check its battery and start a ride in seconds.' },
      { kind: 'heading', text: 'Key Screens' },
      { kind: 'bullet', text: 'Home map with nearby scooters' },
      { kind: 'bullet', text: 'Scooter details with battery level' },
      { kind: 'bullet', text: 'Active ride with live timer' },
      { kind: 'heading', text: 'Visual Language' },
      { kind: 'paragraph', text: 'A dark interface with teal accents keeps the map and ride data readable outdoors.' },
    ]);
  });

  it('renders bold section titles and one paragraph per block', () => {
    const html = descriptionToHtml(DESCRIPTION);
    expect(html).toContain('<p><strong>Key Screens</strong></p>');
    expect(html).toContain('<p>• Home map with nearby scooters</p>');
    expect(html.match(/<p>/g)).toHaveLength(9);
  });

  it('never treats a sentence as a title', () => {
    expect(parseDescription('A short sentence.\nAnother line.')[0]).toEqual({ kind: 'paragraph', text: 'A short sentence. Another line.' });
  });

  it('escapes HTML in AI output', () => {
    expect(descriptionToHtml('Use <script> tags & more')).toBe('<p>Use &lt;script&gt; tags &amp; more</p>');
  });

  it('normalises bullets in the plain-text version', () => {
    expect(descriptionToPlainText('Key Screens\n- One\n* Two')).toBe('Key Screens\n\n• One\n\n• Two');
  });
});
