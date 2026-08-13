import type { Letter, WordItem } from './types'

export const levels = [
  { number: 1, name: 'THE MIXED-UP FOREST', title: 'FIND ALL b!' },
  { number: 2, name: 'THE TWO-RIVER CROSSING', title: 'DRAG EACH LETTER TO BOB OR DAN' },
  { number: 3, name: 'THE ECHO CAVE', title: 'LISTEN. WHAT LETTER COMES FIRST?' },
  { number: 4, name: 'THE VILLAGE OF LOST WORDS', title: 'CHOOSE THE MISSING LETTER' },
] as const

export const wordBank: Record<Letter, string[]> = {
  b: ['ball', 'bed', 'bee', 'bird', 'book', 'box', 'bus', 'baby', 'banana', 'boat'],
  d: ['dog', 'door', 'duck', 'doll', 'desk', 'dish', 'drum', 'dad', 'dance', 'dinosaur'],
}

export const level4Bank: WordItem[] = [
  'ball', 'bed', 'bird', 'book', 'box', 'bus', 'boat',
  'dog', 'door', 'duck', 'doll', 'desk', 'dish', 'drum',
].map(word => ({ word, letter: word[0] as Letter }))

export const pictureMap: Record<string, string> = {
  ball: '⚽', bed: '🛏️', bee: '🐝', bird: '🐦', book: '📘', box: '📦', bus: '🚌',
  baby: '👶', banana: '🍌', boat: '⛵', dog: '🐶', door: '🚪', duck: '🦆', doll: '🪆',
  desk: '🪑', dish: '🍽️', drum: '🥁', dad: '👨', dance: '💃', dinosaur: '🦕',
}

export const positiveFeedback = ['GREAT!', 'WELL DONE!', 'YOU GOT IT!']
export const retryFeedback = ['TRY AGAIN', 'LOOK CAREFULLY', 'LISTEN AGAIN']
