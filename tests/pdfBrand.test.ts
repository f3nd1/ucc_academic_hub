import { describe, it, expect } from 'vitest';
import type jsPDF from 'jspdf';
import { hyphenateLongWords } from '../src/shared/pdfBrand';

/**
 * Stand-in for the jsPDF text metrics: every glyph is exactly 1mm wide at
 * font size 10, scaling linearly with size — the same linear relationship
 * jsPDF's own getTextWidth has, which is all this helper depends on. A real
 * jsPDF instance would make the expected break points font-metric trivia
 * rather than behaviour.
 */
const fakeDoc = () => {
  let size = 10;
  return {
    setFontSize: (n: number) => {
      size = n;
    },
    getTextWidth: (t: string) => t.length * (size / 10),
  } as unknown as jsPDF;
};

describe('hyphenateLongWords', () => {
  it('leaves text whose every word already fits untouched', () => {
    expect(hyphenateLongWords(fakeDoc(), 'Data Types', 6, 10)).toBe('Data Types');
  });

  it('breaks an over-wide word with a hyphen instead of an unmarked split', () => {
    // The reported bug: jsPDF/autoTable split "Representing" at whatever
    // character overflowed, so it rendered as "Repre senting" — two words as
    // far as any reader could tell. The hyphen marks it as one word carried
    // across lines.
    expect(hyphenateLongWords(fakeDoc(), 'Representing', 8, 10)).toBe(
      'Represe-\nnting',
    );
  });

  it('keeps every chunk, hyphen included, inside the column width', () => {
    // A word long enough to need more than one break still never overflows.
    const out = hyphenateLongWords(fakeDoc(), 'Comprehension', 6, 10);
    expect(out.split('\n').length).toBeGreaterThan(2);
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(6);
    expect(out.replace(/[-\n]/g, '')).toBe('Comprehension');
  });

  it('breaks only the words that overflow, leaving the rest of the line alone', () => {
    expect(hyphenateLongWords(fakeDoc(), 'a Representing b', 8, 10)).toBe(
      'a Represe-\nnting b',
    );
  });

  it('scales its measurements with the font size it is given', () => {
    // Same word and column, half the font size — now it fits whole.
    expect(hyphenateLongWords(fakeDoc(), 'Representing', 8, 5)).toBe('Representing');
  });

  it('preserves newlines already in the text (one line per session)', () => {
    expect(hyphenateLongWords(fakeDoc(), '09:30-12:30\nVocabulary', 12, 10)).toBe(
      '09:30-12:30\nVocabulary',
    );
  });

  it('terminates on a column too narrow for even one glyph plus its hyphen', () => {
    // Guards the chunking loop: without the "keep at least one character"
    // rule this would never make progress.
    const out = hyphenateLongWords(fakeDoc(), 'abcd', 1, 10);
    expect(out.replace(/[-\n]/g, '')).toBe('abcd');
  });

  it('passes empty text straight through', () => {
    expect(hyphenateLongWords(fakeDoc(), '', 6, 10)).toBe('');
  });
});
