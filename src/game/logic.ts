import { level4Bank, wordBank } from './data'
import type { Bubble, LevelTask, Letter, Player, WordItem } from './types'

export const shuffle = <T,>(items: T[], random = Math.random): T[] => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const currentPlayerIndex = (turnIndex: number, playerCount: number) => turnIndex % playerCount
export const starsForMistakes = (mistakes: number) => mistakes === 0 ? 2 : mistakes === 1 ? 1 : 0

export const rankPlayers = (players: Player[], scores: Record<string, number>) => {
  const sorted = [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0))
  let previous: number | undefined
  let rank = 0
  return sorted.map((player, index) => {
    const score = scores[player.id] ?? 0
    if (score !== previous) rank = index + 1
    previous = score
    return { ...player, score, rank }
  })
}

export const chooseBalancedWords = (bWords: string[], dWords: string[], random = Math.random): WordItem[] => {
  const bCount = random() < .5 ? 4 : 3
  const dCount = 7 - bCount
  return shuffle([
    ...shuffle(bWords, random).slice(0, bCount).map(word => ({ word, letter: 'b' as Letter })),
    ...shuffle(dWords, random).slice(0, dCount).map(word => ({ word, letter: 'd' as Letter })),
  ], random)
}

const bubbles = (letters: Letter[], prefix: string, random = Math.random): Bubble[] =>
  shuffle(letters, random).map((letter, i) => ({ id: `${prefix}-${i}`, letter, done: false }))

export const generateTasks = (random = Math.random): LevelTask[][] => {
  const targets = shuffle(['b', 'b', 'b', 'b', 'd', 'd', 'd'] as Letter[], random)
  const level1 = Array.from({ length: 7 }, (_, turn) => {
    const bCount = 3 + Math.floor(random() * 3)
    return { target: targets[turn], letters: bubbles([...Array(bCount).fill('b'), ...Array(8 - bCount).fill('d')] as Letter[], `l1-${turn}`, random) }
  })
  const level2 = Array.from({ length: 7 }, (_, turn) => ({
    letters: bubbles(['b', 'b', 'b', 'd', 'd', 'd'], `l2-${turn}`, random),
  }))
  const level3 = chooseBalancedWords(wordBank.b, wordBank.d, random).map(({ word }) => ({ word }))
  const b4 = level4Bank.filter(item => item.letter === 'b').map(item => item.word)
  const d4 = level4Bank.filter(item => item.letter === 'd').map(item => item.word)
  const level4 = chooseBalancedWords(b4, d4, random).map(({ word }) => ({ word }))
  return [level1, level2, level3, level4]
}
