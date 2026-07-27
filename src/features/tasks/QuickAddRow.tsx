import { useState } from 'react'
import './QuickAddRow.css'
import { addOneOffTask } from './taskRepository'
import { PlusIcon } from '../../components/icons'

interface Props {
  /** Optionales Fälligkeitsdatum für neu angelegte Aufgaben. */
  defaultDate?: string | null
  placeholder?: string
}

/** Schnelle Eingabezeile: Titel eintippen + Enter legt eine einmalige Aufgabe an. */
export default function QuickAddRow({ defaultDate = null, placeholder = 'Neue Aufgabe…' }: Props) {
  const [title, setTitle] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    await addOneOffTask({ title: trimmed, categoryId: null, dueDate: defaultDate, reminderTime: null })
    setTitle('')
  }

  return (
    <form className="quick-add" onSubmit={submit}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label="Neue Aufgabe"
      />
      <button type="submit" aria-label="Hinzufügen" disabled={!title.trim()}>
        <PlusIcon size={20} />
      </button>
    </form>
  )
}
