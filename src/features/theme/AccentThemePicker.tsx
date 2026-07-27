import './AccentThemePicker.css'
import { useTheme } from './ThemeProvider'

const ACCENT_PRESETS = ['#4f6df5', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6']

export default function AccentThemePicker() {
  const { mode, accent, setMode, setAccent } = useTheme()

  return (
    <div className="accent-theme">
      <div className="field">
        <label>Modus</label>
        <div className="mode-toggle">
          <button type="button" className={mode === 'dark' ? 'active' : ''} onClick={() => setMode('dark')}>
            Dunkel
          </button>
          <button type="button" className={mode === 'light' ? 'active' : ''} onClick={() => setMode('light')}>
            Hell
          </button>
        </div>
      </div>

      <div className="field">
        <label>Akzentfarbe</label>
        <div className="accent-swatches">
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              className={`accent-swatch${accent.toLowerCase() === color.toLowerCase() ? ' active' : ''}`}
              style={{ background: color }}
              onClick={() => setAccent(color)}
              aria-label={`Akzentfarbe ${color}`}
            />
          ))}
          <label className="accent-swatch accent-custom" style={{ background: accent }}>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
            <span>+</span>
          </label>
        </div>
      </div>
    </div>
  )
}
