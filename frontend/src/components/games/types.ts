export type GameData = {
  quiz_options?: string[];
  quiz_correct_index?: number;
  match_prompt?: string;
  match_answer?: string;
  blank_sentence?: string;
  blank_answer?: string;
} | null;

export type GameCard = {
  card_id: string;
  question: string;
  answer: string;
  game_data?: GameData;
};

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
