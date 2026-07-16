const SMALL: Record<string, number> = {
  zero: 0, oh: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Parse a deliberately constrained count: digits, or English 0..999,999 words. */
export function parseSpokenCount(transcript: string): number | null {
  const clean = transcript.trim().toLowerCase().replace(/[,]/g, '').replace(/-/g, ' ');
  if (/^\d{1,6}$/.test(clean)) return Number(clean);

  const words = clean.split(/\s+/).filter(word => word && word !== 'and');
  if (words.length === 0) return null;
  let total = 0;
  let group = 0;
  for (const word of words) {
    if (word in SMALL) {
      group += SMALL[word];
    } else if (word === 'hundred' && group > 0 && group < 10) {
      group *= 100;
    } else if (word === 'thousand' && group > 0 && total === 0) {
      total = group * 1000;
      group = 0;
    } else {
      return null;
    }
  }
  const value = total + group;
  return Number.isInteger(value) && value <= 999_999 ? value : null;
}
