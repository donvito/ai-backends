import * as fs from 'fs'
import * as path from 'path'

export type ModelCapability =
  | 'summarize'
  | 'web-search'
  | 'pdf-summarizer'
  | 'pdf-translate'
  | 'rewrite'
  | 'compose'
  | 'keywords'
  | 'sentiment'
  | 'planning'
  | 'vision'
  | 'emailReply'
  | 'translate'
  | 'askText'
  | 'meetingNotes'
  | 'outline'

export interface ProviderModelConfigItem {
  name: string
  capabilities: ModelCapability[]
  notes?: string
}

export interface ProviderModelsConfig {
  enabled: boolean
  models: ProviderModelConfigItem[]
}

export interface ModelsCatalogConfig {
  providers: Record<string, ProviderModelsConfig>
}

export function loadModelsCatalog(): ModelsCatalogConfig {
  const filePath = path.resolve(process.cwd(), 'src/config/models.json')
  const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as ModelsCatalogConfig
}

export function getModelsByCapability(capability: ModelCapability): Record<string, string[]> {
  const catalog = loadModelsCatalog()
  const result: Record<string, string[]> = {}
  for (const [provider, cfg] of Object.entries(catalog.providers)) {
    if (!cfg.enabled) continue
    result[provider] = cfg.models
      .filter(m => m.capabilities.includes(capability))
      .map(m => m.name)
  }
  return result
}

export function getAllConfiguredModels(): Record<string, string[]> {
  const catalog = loadModelsCatalog()
  const result: Record<string, string[]> = {}
  for (const [provider, cfg] of Object.entries(catalog.providers)) {
    if (!cfg.enabled) continue
    result[provider] = cfg.models.map(m => m.name)
  }
  return result
}

export function getModelsCatalogByProvider(): Record<string, ProviderModelConfigItem[]> {
  const catalog = loadModelsCatalog()
  const result: Record<string, ProviderModelConfigItem[]> = {}
  for (const [provider, cfg] of Object.entries(catalog.providers)) {
    if (!cfg.enabled) continue
    result[provider] = cfg.models.map(m => ({ name: m.name, capabilities: m.capabilities, notes: m.notes }))
  }
  return result
}

