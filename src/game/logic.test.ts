import { describe, expect, it } from 'vitest'
import { chooseBalancedWords, currentPlayerIndex, generateTasks, rankPlayers, starsForMistakes } from './logic'

describe('game logic', () => {
  it('rotates players by turn index', () => {
    expect(Array.from({ length: 7 }, (_, i) => currentPlayerIndex(i, 3))).toEqual([0, 1, 2, 0, 1, 2, 0])
  })
  it('awards 2, 1, then 0 stars', () => {
    expect([0, 1, 2, 5].map(starsForMistakes)).toEqual([2, 1, 0, 0])
  })
  it('shares ranks when scores tie', () => {
    const players = ['A', 'B', 'C', 'D'].map((name, i) => ({ id: `${i}`, name }))
    expect(rankPlayers(players, { 0: 8, 1: 10, 2: 8, 3: 4 }).map(x => x.rank)).toEqual([1, 2, 2, 4])
  })
  it('chooses seven unique balanced words', () => {
    const chosen = chooseBalancedWords(['ball','bed','bee','bird','book'], ['dog','door','duck','doll','desk'], () => .3)
    expect(chosen).toHaveLength(7)
    expect(new Set(chosen.map(x => x.word)).size).toBe(7)
    const bCount = chosen.filter(x => x.letter === 'b').length
    expect(Math.abs(bCount - (7 - bCount))).toBe(1)
  })
  it('mixes b and d targets in level one', () => {
    const targets = generateTasks(() => .4)[0].map(task => task.target)
    expect(targets.filter(letter => letter === 'b')).toHaveLength(4)
    expect(targets.filter(letter => letter === 'd')).toHaveLength(3)
  })
})
