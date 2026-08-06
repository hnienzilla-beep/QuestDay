import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays } from 'date-fns'
import './SummaryPanel.css'
import { isoDateOf, todayISODate } from '../../utils/dateUtils'
import { buildDaySummary, type DaySummary } from './daySummary'
import { summaryExportText, summaryLines, summaryPlainText } from './summaryText'
import { cancelSpeech, speak, speechSupported, warmUpVoices } from './speech'
import { shareOrDownloadSummary } from './shareSummary'

type Tab = 'today' | 'tomorrow'

export default function SummaryPanel() {
  const [tab, setTab] = useState<Tab>('today')
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todayStr = todayISODate()
  const tomorrowStr = isoDateOf(addDays(new Date(), 1))

  const summaries = useLiveQuery<{ today: DaySummary; tomorrow: DaySummary }>(async () => {
    const [today, tomorrow] = await Promise.all([buildDaySummary(todayStr), buildDaySummary(tomorrowStr)])
    return { today, tomorrow }
  }, [todayStr, tomorrowStr])

  useEffect(() => {
    warmUpVoices()
    return () => cancelSpeech()
  }, [])

  if (!summaries) return null

  const active = tab === 'today' ? summaries.today : summaries.tomorrow
  const lines = summaryLines(active)

  const handleSpeak = () => {
    if (speaking) {
      cancelSpeech()
      setSpeaking(false)
      return
    }
    setError(null)
    setSpeaking(true)
    speak(summaryPlainText(active), {
      onEnd: () => setSpeaking(false),
      onError: () => {
        setSpeaking(false)
        setError('Sprachausgabe nicht möglich. Prüfe, ob der Stummschalter aktiv ist.')
      },
    })
  }

  const handleShare = async () => {
    setError(null)
    try {
      await shareOrDownloadSummary(
        summaryExportText(summaries.today, summaries.tomorrow),
        `questday-zusammenfassung-${todayStr}.txt`,
      )
    } catch {
      setError('Speichern fehlgeschlagen.')
    }
  }

  const switchTab = (next: Tab) => {
    if (next === tab) return
    cancelSpeech()
    setSpeaking(false)
    setTab(next)
  }

  return (
    <section className="summary-card" aria-label="Tageszusammenfassung">
      <div className="summary-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'today'}
          className={tab === 'today' ? 'active' : ''}
          onClick={() => switchTab('today')}
        >
          Heute
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tomorrow'}
          className={tab === 'tomorrow' ? 'active' : ''}
          onClick={() => switchTab('tomorrow')}
        >
          Morgen
        </button>
      </div>

      <ul className="summary-lines">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>

      <div className="summary-actions">
        {speechSupported() && (
          <button type="button" className="summary-btn" onClick={handleSpeak}>
            {speaking ? '⏹ Stopp' : '🔊 Vorlesen'}
          </button>
        )}
        <button type="button" className="summary-btn" onClick={handleShare}>
          ⤓ Heute + Morgen speichern
        </button>
      </div>

      {error && <p className="summary-error">{error}</p>}

      <p className="summary-hint">
        Die Zusammenfassung wird direkt auf dem Gerät vorgelesen. Ein Export als Audiodatei ist ohne
        Cloud-Dienst technisch nicht möglich – gespeichert wird deshalb der Text von heute und morgen.
      </p>
    </section>
  )
}
