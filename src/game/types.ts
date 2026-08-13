export type Screen = 'menu' | 'players' | 'names' | 'story' | 'level' | 'final'
export type Letter = 'b' | 'd'

export interface Player { id: string; name: string }
export interface WordItem { word: string; letter: Letter }
export interface Bubble { id: string; letter: Letter; done: boolean }
export interface LevelTask {
  letters?: Bubble[]
  word?: string
  target?: Letter
}
export interface GameState {
  screen: Screen
  playerCount: number | null
  players: Player[]
  scoreByPlayerId: Record<string, number>
  currentLevel: number
  turnIndex: number
  mistakesInTurn: number
  tasks: LevelTask[][]
  soundOn: boolean
  turnNotice: boolean
  feedback: string
}

export interface SaveSlot {
  id: string
  createdAt: string
  state: GameState
}
