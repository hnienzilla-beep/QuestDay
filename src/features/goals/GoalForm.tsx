import { useState } from 'react'
import './GoalForm.css'
import { CATEGORIES, type Category } from '../../types/task'
import { addGoal } from './goalRepository'

interface Props {
  onClose: () => void
}

export default function GoalForm({ onClose }: Props) {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [category, setCategory] = useState<Category>('Sonstiges')
  const [targetDate, setTargetDate] = useState('')
  const [subSteps, setSubSteps] = useState<string[]>([''])

  const updateSubStep = (index: number, value: string) => {
    setSubSteps((steps) => steps.map((s, i) => (i === index ? value : s)))
  }

  const addSubStepField = () => setSubSteps((steps) => [...steps, ''])
  const removeSubStepField = (index: number) =>
    setSubSteps((steps) => steps.filter((_, i) => i !== index))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    await addGoal({
      title: title.trim(),
      target: target.trim(),
      category,
      targetDate: targetDate || null,
      subStepTitles: subSteps.map((s) => s.trim()).filter((s) => s.length > 0),
    })

    onClose()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>Neues Ziel</h2>
          <button type="button" className="sheet-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="goalTitle">Titel</label>
            <input
              id="goalTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Wohnung renovieren"
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label htmlFor="goalTarget">Ziel (kurz beschrieben)</label>
            <input
              id="goalTarget"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="z.B. Alle Zimmer neu gestrichen"
            />
          </div>

          <div className="field">
            <label>Kategorie</label>
            <div className="category-toggle">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={category === c ? 'active' : ''}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="targetDate">Zieldatum (optional)</label>
            <input
              id="targetDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Teilschritte</label>
            {subSteps.map((step, index) => (
              <div className="substep-row" key={index}>
                <input
                  value={step}
                  onChange={(e) => updateSubStep(index, e.target.value)}
                  placeholder={`Schritt ${index + 1}`}
                />
                {subSteps.length > 1 && (
                  <button
                    type="button"
                    className="substep-remove"
                    onClick={() => removeSubStepField(index)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="substep-add" onClick={addSubStepField}>
              + Schritt hinzufügen
            </button>
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            Ziel speichern
          </button>
        </form>
      </div>
    </div>
  )
}
