import type { Character } from "../types";

export const levelUp = (character: Character): Character => ({
  ...(character.currentPage >= character.maxPages
    ? character
    : {
        ...character,
        currentPage: character.currentPage + 1,
        level: character.currentPage + 1,
        atk: character.atk + 3,
        hp: character.hp + 12
      })
});

export const awakenCharacter = (character: Character): Character => ({
  ...character,
  awaken: character.awaken + 1,
  atk: character.atk + 5,
  hp: character.hp + 20
});

