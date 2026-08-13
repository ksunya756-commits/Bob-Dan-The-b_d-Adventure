import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { levels, pictureMap, positiveFeedback, retryFeedback } from './game/data'
import { currentPlayerIndex, generateTasks, rankPlayers, shuffle, starsForMistakes } from './game/logic'
import type { GameState, Letter, Player, SaveSlot, Screen } from './game/types'

const ASSETS = '/game-assets'
const STORAGE_KEY = 'bob-and-dan-game-v1'
const SAVES_KEY = 'bob-and-dan-saves-v1'

const initialState = (): GameState => ({
  screen: 'menu', playerCount: null, players: [], scoreByPlayerId: {}, currentLevel: 0,
  turnIndex: 0, mistakesInTurn: 0, tasks: [], soundOn: true, turnNotice: false, feedback: '',
})

const restoreState = (): GameState => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as GameState
    if (saved && ['menu', 'players', 'names', 'story', 'level', 'final'].includes(saved.screen)) {
      return { ...initialState(), ...saved, turnNotice: saved.screen === 'level', feedback: '' }
    }
  } catch { /* start fresh */ }
  return initialState()
}

const restoreSaves = (): SaveSlot[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVES_KEY) ?? '[]') as SaveSlot[]
    return Array.isArray(saved) ? saved : []
  } catch { return [] }
}

function useSound(enabled: boolean) {
  const context = useRef<AudioContext | null>(null)
  return useCallback((kind: 'hover' | 'good' | 'soft' | 'level' | 'final') => {
    if (!enabled) return
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = context.current ??= new AudioCtx()
    const patterns = {
      hover: [[440, .018, .035]], soft: [[220, .05, .14]], good: [[520, 0, .09], [720, .08, .12]],
      level: [[440, 0, .1], [590, .1, .1], [780, .2, .16]], final: [[440, 0, .12], [554, .1, .12], [659, .2, .12], [880, .32, .25]],
    } as const
    patterns[kind].forEach(([frequency, delay, duration]) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'; oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(.0001, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(kind === 'hover' ? .018 : .075, ctx.currentTime + delay + .015)
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + delay + duration)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(ctx.currentTime + delay); oscillator.stop(ctx.currentTime + delay + duration + .02)
    })
  }, [enabled])
}

export default function App() {
  const [game, setGame] = useState<GameState>(restoreState)
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>(restoreSaves)
  const [howTo, setHowTo] = useState(false)
  const [draftNames, setDraftNames] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [heroReaction, setHeroReaction] = useState<Letter | null>(null)
  const advancing = useRef(false)
  const sound = useSound(game.soundOn)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(game)) }, [game])
  useEffect(() => {
    if (!game.turnNotice) return
    const timer = window.setTimeout(() => setGame(g => ({ ...g, turnNotice: false })), 1200)
    return () => window.clearTimeout(timer)
  }, [game.turnNotice, game.currentLevel, game.turnIndex])

  const level = levels[game.currentLevel]
  const task = game.tasks[game.currentLevel]?.[game.turnIndex]
  const playerIndex = game.players.length ? currentPlayerIndex(game.turnIndex, game.players.length) : 0
  const currentPlayer = game.players[playerIndex]

  const speak = useCallback((word: string | undefined) => {
    if (!word || !game.soundOn || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(word)
    const voices = window.speechSynthesis.getVoices()
    utterance.voice = voices.find(voice => /^en(-|_)/i.test(voice.lang)) ?? voices[0] ?? null
    utterance.lang = 'en-US'; utterance.rate = .75; utterance.pitch = 1.05
    window.speechSynthesis.speak(utterance)
  }, [game.soundOn])

  const spokenPrompt = useMemo(() => {
    if (game.currentLevel === 0) {
      const target = task?.target ?? 'b'
      return `Find all ${target}. Tap every letter ${target}.`
    }
    if (game.currentLevel === 1) return 'Drag each letter to Bob or Dan. Put b with Bob and d with Dan.'
    return task?.word
  }, [game.currentLevel, task?.target, task?.word])

  useEffect(() => {
    if (game.screen === 'level' && !game.turnNotice) speak(spokenPrompt)
  }, [game.screen, game.currentLevel, game.turnIndex, game.turnNotice, speak, spokenPrompt])

  const startLevel = useCallback(() => {
    setGame(g => ({ ...g, screen: 'level', currentLevel: 0, turnIndex: 0, mistakesInTurn: 0, turnNotice: true, feedback: '' }))
  }, [])

  const beginGame = () => {
    const count = game.playerCount ?? 1
    const players: Player[] = Array.from({ length: count }, (_, i) => ({
      id: `player-${i + 1}`, name: draftNames[i]?.trim().slice(0, 12) || `Player ${i + 1}`,
    }))
    setGame(g => ({ ...g, screen: 'story', players, tasks: generateTasks(), scoreByPlayerId: Object.fromEntries(players.map(p => [p.id, 0])), currentLevel: 0, turnIndex: 0, mistakesInTurn: 0 }))
  }

  const flash = useCallback((message: string, isGood: boolean) => {
    sound(isGood ? 'good' : 'soft')
    setGame(g => ({ ...g, feedback: message }))
    window.setTimeout(() => setGame(g => ({ ...g, feedback: '' })), 850)
  }, [sound])

  const advanceTurn = useCallback((mistakes: number) => {
    if (advancing.current) return
    advancing.current = true
    const gained = starsForMistakes(mistakes)
    const message = mistakes < 2 ? shuffle(positiveFeedback)[0] : 'HERE IS THE ANSWER!'
    flash(message, mistakes < 2)
    window.setTimeout(() => {
      setGame(g => {
        const player = g.players[currentPlayerIndex(g.turnIndex, g.players.length)]
        const scores = { ...g.scoreByPlayerId, [player.id]: (g.scoreByPlayerId[player.id] ?? 0) + gained }
        if (g.turnIndex < 6) return { ...g, scoreByPlayerId: scores, turnIndex: g.turnIndex + 1, mistakesInTurn: 0, turnNotice: true, feedback: '' }
        if (g.currentLevel < 3) {
          sound('level')
          return { ...g, scoreByPlayerId: scores, currentLevel: g.currentLevel + 1, turnIndex: 0, mistakesInTurn: 0, turnNotice: true, feedback: '' }
        }
        sound('final')
        return { ...g, scoreByPlayerId: scores, screen: 'final', mistakesInTurn: 0, feedback: '' }
      })
      setHeroReaction(null); advancing.current = false
    }, 900)
  }, [flash, sound])

  const makeMistake = useCallback(() => {
    if (advancing.current) return
    const next = game.mistakesInTurn + 1
    if (next >= 2) {
      setGame(g => ({ ...g, mistakesInTurn: next }))
      advanceTurn(next)
    } else {
      setGame(g => ({ ...g, mistakesInTurn: next }))
      flash(shuffle(retryFeedback)[0], false)
    }
  }, [advanceTurn, flash, game.mistakesInTurn])

  const chooseLevel1 = (id: string, letter: Letter) => {
    const target = task?.target ?? 'b'
    if (letter !== target) { makeMistake(); return }
    sound('good'); setHeroReaction(target)
    const remaining = task?.letters?.filter(item => !item.done && item.id !== id && item.letter === target).length ?? 0
    setGame(g => ({ ...g, tasks: g.tasks.map((row, li) => li === g.currentLevel ? row.map((item, ti) => ti === g.turnIndex ? { ...item, letters: item.letters?.map(b => b.id === id ? { ...b, done: true } : b) } : item) : row) }))
    if (remaining === 0) advanceTurn(game.mistakesInTurn)
  }

  const dropBubble = (id: string, target: Letter) => {
    if (advancing.current) return
    const bubble = task?.letters?.find(item => item.id === id)
    if (!bubble || bubble.done) return
    if (bubble.letter !== target) { setDragId(null); makeMistake(); return }
    sound('good'); setHeroReaction(target); setDragId(null)
    const remaining = task!.letters!.filter(item => !item.done && item.id !== id).length
    setGame(g => ({ ...g, tasks: g.tasks.map((row, li) => li === 1 ? row.map((item, ti) => ti === g.turnIndex ? { ...item, letters: item.letters?.map(b => b.id === id ? { ...b, done: true } : b) } : item) : row) }))
    if (remaining === 0) advanceTurn(game.mistakesInTurn)
  }

  const pointerDrop = (event: React.PointerEvent, id: string) => {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop]')
    if (element?.dataset.drop === 'b' || element?.dataset.drop === 'd') dropBubble(id, element.dataset.drop)
    else setDragId(null)
  }

  const answerWord = useCallback((letter: Letter) => {
    if (!task?.word || advancing.current) return
    const correct = task.word[0] as Letter
    if (letter !== correct) { makeMistake(); return }
    setHeroReaction(letter)
    advanceTurn(game.mistakesInTurn)
  }, [advanceTurn, game.mistakesInTurn, makeMistake, task?.word])

  useEffect(() => {
    if (game.screen !== 'level' || (game.currentLevel !== 2 && game.currentLevel !== 3)) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'b' || event.key.toLowerCase() === 'd') answerWord(event.key.toLowerCase() as Letter)
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [answerWord, game.currentLevel, game.screen])

  const replay = () => setGame(g => ({ ...g, screen: 'story', scoreByPlayerId: Object.fromEntries(g.players.map(p => [p.id, 0])), tasks: generateTasks(), currentLevel: 0, turnIndex: 0, mistakesInTurn: 0, feedback: '' }))
  const mainMenu = () => { const next = { ...initialState(), soundOn: game.soundOn }; localStorage.removeItem(STORAGE_KEY); setGame(next) }

  const saveGame = () => {
    const slot: SaveSlot = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      state: { ...game, turnNotice: false, feedback: '' },
    }
    setSaveSlots(previous => {
      const next = [slot, ...previous]
      localStorage.setItem(SAVES_KEY, JSON.stringify(next))
      return next
    })
    flash('GAME SAVED!', true)
  }

  const loadGame = (slot: SaveSlot) => {
    const restored = { ...initialState(), ...slot.state, turnNotice: slot.state.screen === 'level', feedback: '' }
    setGame(restored)
  }

  const clearSaveHistory = () => {
    localStorage.removeItem(SAVES_KEY)
    setSaveSlots([])
  }

  const jumpTo = (screen: Screen, levelIndex?: number) => {
    setGame(g => ({ ...g, screen, currentLevel: levelIndex ?? g.currentLevel, turnIndex: 0, mistakesInTurn: 0, feedback: '', turnNotice: screen === 'level' }))
  }

  return <main className={`app screen-${game.screen} ${game.screen === 'level' ? `level-${game.currentLevel + 1}` : ''}`}>
    <div className="scene" aria-live="polite">
      <UtilityButtons soundOn={game.soundOn} toggleSound={() => setGame(g => ({ ...g, soundOn: !g.soundOn }))} />
      {game.screen !== 'menu' && game.players.length > 0 && <ProgressTools onHome={mainMenu} onSave={saveGame} onJump={jumpTo} />}
      {game.screen === 'menu' && <Menu saves={saveSlots} onLoad={loadGame} onClear={clearSaveHistory} onStart={() => setGame(g => ({ ...g, screen: 'players' }))} onHow={() => setHowTo(true)} />}
      {game.screen === 'players' && <ChoosePlayers selected={game.playerCount} onSelect={count => { sound('hover'); setGame(g => ({ ...g, playerCount: count })) }} onBack={mainMenu} onNext={() => { setDraftNames(Array.from({ length: game.playerCount! }, (_, i) => game.players[i]?.name ?? '')); setGame(g => ({ ...g, screen: 'names' })) }} />}
      {game.screen === 'names' && <Names count={game.playerCount!} values={draftNames} onChange={(i, value) => setDraftNames(names => names.map((name, n) => n === i ? value : name))} onBack={() => setGame(g => ({ ...g, screen: 'players' }))} onStart={beginGame} />}
      {game.screen === 'story' && <Story onContinue={startLevel} />}
      {game.screen === 'level' && level && task && <>
        <LevelHeader level={level} player={currentPlayer?.name ?? ''} turn={game.turnIndex + 1} />
        <h1 className="task-title">{game.currentLevel === 0 ? `FIND ALL ${task.target ?? 'b'}!` : level.title}</h1>
        <button className="task-audio" onClick={() => speak(spokenPrompt)} aria-label={game.currentLevel >= 2 ? 'Listen to the word' : 'Listen to the instruction'} title={game.currentLevel >= 2 ? 'Listen to the word' : 'Listen to the instruction'}>🔊</button>
        {game.currentLevel === 0 && <LevelOne letters={task.letters ?? []} target={task.target ?? 'b'} onChoose={chooseLevel1} reacting={heroReaction} />}
        {game.currentLevel === 1 && <LevelTwo letters={task.letters ?? []} dragId={dragId} setDragId={setDragId} onDrop={dropBubble} onPointerDrop={pointerDrop} reacting={heroReaction} />}
        {game.currentLevel === 2 && <WordLevel mode="listen" word={task.word!} onAnswer={answerWord} onPrompt={() => speak(task.word)} reacting={heroReaction} />}
        {game.currentLevel === 3 && <WordLevel mode="missing" word={task.word!} onAnswer={answerWord} onPrompt={() => flash('LOOK AT THE PICTURE', true)} reacting={heroReaction} />}
      </>}
      {game.screen === 'final' && <Final players={game.players} scores={game.scoreByPlayerId} onReplay={replay} onMenu={mainMenu} />}
      {game.turnNotice && currentPlayer && <div className="turn-notice"><span>{currentPlayer.name.toUpperCase()}’S TURN</span></div>}
      {game.feedback && <div className="feedback">{game.feedback}</div>}
      {howTo && <Modal onClose={() => setHowTo(false)} />}
    </div>
  </main>
}

function UtilityButtons({ soundOn, toggleSound }: { soundOn: boolean; toggleSound: () => void }) {
  const fullscreen = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
  return <div className="utilities">
    <button className="icon-button" onClick={toggleSound} aria-label={soundOn ? 'Mute sound' : 'Turn sound on'}>{soundOn ? '🔊' : '🔇'}</button>
    <button className="icon-button" onClick={fullscreen} aria-label="Toggle fullscreen">⛶</button>
  </div>
}

function ProgressTools({ onHome, onSave, onJump }: { onHome: () => void; onSave: () => void; onJump: (screen: Screen, levelIndex?: number) => void }) {
  return <div className="progress-tools">
    <button className="tool-home" onClick={onHome}>HOME</button>
    <button className="tool-save" onClick={onSave}>SAVE</button>
    <details className="location-jump"><summary>LOCATIONS</summary><div>
      <button onClick={() => onJump('story')}>STORY</button>
      {[0, 1, 2, 3].map(index => <button key={index} onClick={() => onJump('level', index)}>LEVEL {index + 1}</button>)}
      <button onClick={() => onJump('final')}>FINAL</button>
    </div></details>
  </div>
}

function Menu({ saves, onLoad, onClear, onStart, onHow }: { saves: SaveSlot[]; onLoad: (slot: SaveSlot) => void; onClear: () => void; onStart: () => void; onHow: () => void }) {
  return <section className="menu-screen">
    <div className="menu-title"><h1>BOB &amp; DAN</h1><p>THE <b>b–d</b> ADVENTURE</p></div>
    <img className="menu-bob" src={`${ASSETS}/characters/bob.png`} alt="Bob the beaver" />
    <img className="menu-dan" src={`${ASSETS}/characters/dan.png`} alt="Dan the dragon" />
    <div className="menu-actions"><button className="primary big" onClick={onStart}>START GAME</button><button className="secondary" onClick={onHow}>HOW TO PLAY</button></div>
    <div className="glass save-history"><div className="save-history-title"><h2>SAVED GAMES</h2>{saves.length > 0 && <button onClick={onClear}>DELETE ALL</button>}</div>{saves.length === 0 ? <p>NO SAVED GAMES YET</p> : <div className="save-list">{saves.map(slot => <div className="save-row" key={slot.id}><button className="load-save" onClick={() => onLoad(slot)}><strong>{slot.state.players.map(player => player.name).join(', ') || 'Adventure'}</strong><span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(slot.createdAt))}</span><small>{slot.state.screen === 'level' ? `LEVEL ${slot.state.currentLevel + 1} · ${slot.state.turnIndex + 1} / 7` : slot.state.screen.toUpperCase()}</small></button></div>)}</div>}</div>
  </section>
}

function CharacterPair() {
  return <><img className="side-character left" src={`${ASSETS}/characters/bob.png`} alt="Bob the beaver" /><img className="side-character right" src={`${ASSETS}/characters/dan.png`} alt="Dan the dragon" /></>
}

function ChoosePlayers({ selected, onSelect, onBack, onNext }: { selected: number | null; onSelect: (n: number) => void; onBack: () => void; onNext: () => void }) {
  return <section className="setup-screen"><CharacterPair/><div className="glass setup-card"><h1>CHOOSE PLAYERS</h1><h2>HOW MANY PLAYERS?</h2><div className="player-counts">{[1,2,3,4,5,6,7].map(n => <button key={n} className={selected === n ? 'selected' : ''} aria-pressed={selected === n} onClick={() => onSelect(n)}>{n}</button>)}</div><p>Tap a number to choose</p><button className="primary next" disabled={!selected} onClick={onNext}>NEXT</button><button className="secondary back" onClick={onBack}>BACK</button></div></section>
}

function Names({ count, values, onChange, onBack, onStart }: { count: number; values: string[]; onChange: (i: number, value: string) => void; onBack: () => void; onStart: () => void }) {
  return <section className="setup-screen"><CharacterPair/><div className="glass setup-card names-card"><h1>PLAYER NAMES</h1><h2>ENTER A NAME FOR EACH PLAYER</h2><div className="name-grid">{Array.from({ length: count }, (_, i) => <label key={i}><span>{i + 1}</span><input maxLength={12} value={values[i] ?? ''} onChange={e => onChange(i, e.target.value)} placeholder={`Player ${i + 1}`} aria-label={`Player ${i + 1} name`} /></label>)}</div><button className="secondary back" onClick={onBack}>BACK</button><button className="primary start-adventure" onClick={onStart}>START ADVENTURE</button></div></section>
}

function Story({ onContinue }: { onContinue: () => void }) {
  return <section className="story-screen"><h1>A LETTER MIX-UP!</h1><img className="story-bob" src={`${ASSETS}/characters/bob.png`} alt="Bob the beaver"/><img className="story-miro" src={`${ASSETS}/characters/miro.png`} alt="Miro the wizard"/><img className="story-dan" src={`${ASSETS}/characters/dan.png`} alt="Dan the dragon"/><div className="floating-letters" aria-hidden="true"><i>b</i><i>d</i><i>d</i><i>b</i></div><div className="glass story-panel"><p>Miro’s magic mirror mixed up b and d!</p><p>Help Bob and Dan put the letters back.</p><button className="secondary" onClick={onContinue}>SKIP</button><button className="primary" onClick={onContinue}>NEXT</button></div></section>
}

function LevelHeader({ level, player, turn }: { level: typeof levels[number]; player: string; turn: number }) {
  return <header className="level-header"><div>LEVEL {level.number} <span>·</span> {level.name}</div><div><strong>PLAYER: {player.toUpperCase()}</strong><span>{turn} / 7</span></div></header>
}

function LevelOne({ letters, target, onChoose, reacting }: { letters: NonNullable<ReturnType<typeof generateTasks>[number][number]['letters']>; target: Letter; onChoose: (id: string, letter: Letter) => void; reacting: Letter | null }) {
  const isBob = target === 'b'
  return <section className="level-one"><div className="bubble-field">{letters.map((bubble, i) => <button key={bubble.id} style={{ '--i': i } as React.CSSProperties} className={`letter-bubble bubble-${i} ${bubble.done ? 'collected' : ''}`} disabled={bubble.done} onClick={() => onChoose(bubble.id, bubble.letter)} aria-label={`${bubble.letter} letter`}>{bubble.letter}</button>)}</div><img className={`level1-bob ${isBob ? '' : 'dan'} ${reacting === target ? 'react' : ''}`} src={`${ASSETS}/characters/${isBob ? 'bob.png' : 'dan.png'}`} alt={isBob ? 'Bob the beaver' : 'Dan the dragon'}/><div className="bottom-hint left-hint">{isBob ? 'BOB' : 'DAN'}: YOU CAN DO IT!</div></section>
}

type BubbleList = NonNullable<ReturnType<typeof generateTasks>[number][number]['letters']>
function LevelTwo({ letters, dragId, setDragId, onDrop, onPointerDrop, reacting }: { letters: BubbleList; dragId: string | null; setDragId: (id: string | null) => void; onDrop: (id: string, target: Letter) => void; onPointerDrop: (event: React.PointerEvent, id: string) => void; reacting: Letter | null }) {
  return <section className="level-two"><div className="drop-zone bob-zone" data-drop="b" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragId) onDrop(dragId, 'b') }}><img className={reacting === 'b' ? 'react' : ''} src={`${ASSETS}/characters/bob-flag.png`} alt="Bob holding the b flag" /><span className="flag-letter" aria-hidden="true">b</span></div><div className="drag-bubbles">{letters.map((bubble, i) => <button key={bubble.id} style={{ '--i': i } as React.CSSProperties} className={`letter-bubble drag-${i} ${bubble.done ? 'collected' : ''} ${dragId === bubble.id ? 'dragging' : ''}`} disabled={bubble.done} draggable onDragStart={() => setDragId(bubble.id)} onDragEnd={() => setDragId(null)} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDragId(bubble.id) }} onPointerUp={e => onPointerDrop(e, bubble.id)}>{bubble.letter}</button>)}</div><div className="drop-zone dan-zone" data-drop="d" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragId) onDrop(dragId, 'd') }}><img className={reacting === 'd' ? 'react' : ''} src={`${ASSETS}/characters/dan-flag-v2-mirrored.png`} alt="Dan holding the d flag" /><span className="flag-letter" aria-hidden="true">d</span></div><div className="bottom-hint">DRAG THE BUBBLES TO A HERO</div></section>
}

function WordLevel({ mode, word, onAnswer, onPrompt, reacting }: { mode: 'listen' | 'missing'; word: string; onAnswer: (letter: Letter) => void; onPrompt: () => void; reacting: Letter | null }) {
  return <section className="word-level"><div className="hero-platform left-platform"><img className={reacting === 'b' ? 'react' : ''} src={`${ASSETS}/characters/bob.png`} alt="Bob standing on the left stone platform"/><button className="choice-letter" onClick={() => onAnswer('b')} aria-label="Choose b">b</button></div><div className={`word-card ${mode}`}><span className="picture" role="img" aria-label={word}>{pictureMap[word]}</span>{mode === 'missing' && <strong>_{word.slice(1)}</strong>}</div><button className={`speaker ${mode}`} onClick={onPrompt} aria-label={mode === 'listen' ? 'Repeat the word' : 'Look at the picture'}>{mode === 'listen' ? '🔊' : '👀'}</button><div className="hero-platform right-platform"><img className={reacting === 'd' ? 'react' : ''} src={`${ASSETS}/characters/dan.png`} alt="Dan standing on the right stone platform"/><button className="choice-letter" onClick={() => onAnswer('d')} aria-label="Choose d">d</button></div><button className="bottom-hint prompt" onClick={onPrompt}>{mode === 'listen' ? 'TAP THE SPEAKER AGAIN' : 'LOOK AT THE PICTURE'}</button></section>
}

function Final({ players, scores, onReplay, onMenu }: { players: Player[]; scores: Record<string, number>; onReplay: () => void; onMenu: () => void }) {
  const ranking = rankPlayers(players, scores)
  return <section className="final-screen"><header className="level-header"><div>FINAL · THE VILLAGE IS SAVED!</div><div><strong>{players.length} {players.length === 1 ? 'PLAYER' : 'PLAYERS'}</strong></div></header><img className="final-bob" src={`${ASSETS}/characters/bob.png`} alt="Bob the beaver"/><img className="final-dan" src={`${ASSETS}/characters/dan.png`} alt="Dan the dragon"/><div className="glass results"><h1>GREAT JOB!</h1><h2>FINAL RESULTS</h2><div className="ranking">{ranking.map(item => <div key={item.id} className={item.rank === 1 ? 'winner' : ''}><span>{item.rank}. {item.name.toUpperCase()}</span><strong>{item.score} {item.score === 1 ? 'STAR' : 'STARS'}</strong></div>)}</div></div><div className="final-actions"><button className="primary" onClick={onReplay}>PLAY AGAIN</button><button className="secondary" onClick={onMenu}>MAIN MENU</button></div></section>
}

function Modal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="how-title"><div className="glass modal"><h1 id="how-title">HOW TO PLAY</h1><p>Look carefully. Listen carefully. Help Bob with b and Dan with d. Take turns and collect stars!</p><button className="primary" autoFocus onClick={onClose}>GOT IT</button></div></div>
}
