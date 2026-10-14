// Web Audio API notification sounds (zero external file dependencies)
class SoundManager {
  private ctx: AudioContext | null = null
  private enabled: boolean = true

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  public setEnabled(val: boolean) {
    this.enabled = val
  }

  public isEnabled(): boolean {
    return this.enabled
  }

  public play(type: 'info' | 'success' | 'warning' | 'error' | 'calendar') {
    if (!this.enabled) return
    try {
      const ctx = this.getContext()
      if (!ctx) return

      const now = ctx.currentTime

      if (type === 'success') {
        // High harmonic ascending pleasant chord (C5 -> E5 -> G5)
        const notes = [523.25, 659.25, 783.99]
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, now + idx * 0.08)

          gain.gain.setValueAtTime(0, now + idx * 0.08)
          gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.08 + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35)

          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(now + idx * 0.08)
          osc.stop(now + idx * 0.08 + 0.36)
        })
      } else if (type === 'calendar') {
        // Double bell chime (A5 -> D6)
        const notes = [880, 1174.66]
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(freq, now + idx * 0.12)

          gain.gain.setValueAtTime(0.18, now + idx * 0.12)
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.4)

          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(now + idx * 0.12)
          osc.stop(now + idx * 0.12 + 0.41)
        })
      } else if (type === 'warning') {
        // Two subtle warning pulses
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(440, now)
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.2)

        gain.gain.setValueAtTime(0.12, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.26)
      } else if (type === 'error') {
        // Low descending warning buzz
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(220, now)
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.3)

        gain.gain.setValueAtTime(0.1, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.36)
      } else {
        // Info ping (gentle glass bubble)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(659.25, now)
        osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.1)

        gain.gain.setValueAtTime(0.15, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.26)
      }
    } catch {
      // AudioContext might be blocked until interaction
    }
  }
}

export const soundManager = new SoundManager()
