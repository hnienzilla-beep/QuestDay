/** Teilt die Zusammenfassung über das iOS-Sharesheet oder lädt sie als Textdatei herunter. */
export async function shareOrDownloadSummary(text: string, filename: string): Promise<void> {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const file = new File([blob], filename, { type: 'text/plain' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'QuestDay-Zusammenfassung' })
      return
    } catch {
      // Sharesheet abgebrochen - auf Download zurückfallen
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
