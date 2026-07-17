export interface ThemeDefinition {
  id: string
  label: string
  requiredLevel: number
}

export const THEMES: ThemeDefinition[] = [
  { id: 'default', label: 'Standard', requiredLevel: 1 },
  { id: 'forest', label: 'Wald', requiredLevel: 3 },
  { id: 'sunset', label: 'Sonnenuntergang', requiredLevel: 5 },
  { id: 'ocean', label: 'Ozean', requiredLevel: 8 },
]
