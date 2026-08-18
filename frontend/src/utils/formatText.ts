// AI-extracted exercise text often comes back as one dense run-on paragraph
// (numbering like "1)", "a)", "II)" glued to the surrounding sentence with no
// line breaks). This reformats it into readable paragraphs/lines without
// touching content that already has real structure from the source.
export function formatExerciseText(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = raw.trim();
  const existingBreaks = (text.match(/\n/g) || []).length;
  if (existingBreaks >= 2) return text;

  let out = text;

  // New paragraph before exercise/subject headers appearing mid-text.
  // "التمرين"/"الموضوع" must be tried whole (with the "ال" article) before
  // the bare word, otherwise the bare alternative matches mid-word and
  // splits "ال" + "تمرين" apart.
  out = out.replace(/\s*(الموضوع|التمرين|تمرين|Exercice\s)/g, "\n\n$1");

  // New line before numbered/lettered/roman-numeral sub-question markers,
  // e.g. " 3) " / " II) " / " b) " or " 3. " — requires surrounding spaces/word
  // boundary so it doesn't fire inside coordinates like "(O;i,j)" or decimals
  // like "2,3". The period-marker form additionally requires a following
  // letter (not a digit) so real decimal numbers like "2.5" are left alone.
  out = out.replace(/\s((?:[0-9]{1,2}|[IVXivx]{1,4}|[a-zA-Z])\))\s/g, "\n$1 ");
  out = out.replace(/\s([0-9]{1,2}\.)\s(?=[A-Za-z؀-ۿ])/g, "\n$1 ");

  // New line after a sentence-ending period when followed by a capital
  // Latin or an Arabic letter (decimals in this content use ",", not ".",
  // so this is safe from breaking numbers). The char right before the period
  // must not be a digit, otherwise this would re-split "1. " markers that
  // the rule above already placed on their own line (e.g. "1.\nfoo").
  out = out.replace(/([^\s0-9])\.\s+(?=[A-ZÀ-Ý؀-ۿ])/g, "$1.\n");

  out = out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");

  return out;
}
