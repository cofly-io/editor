/**
 * Industrial Render Contract Rules Loader
 *
 * Loads render contract rules from IndustrialPack quality-rules or
 * a standalone render-rules.json, enabling runtime registration of
 * new semantic roles without modifying editor code.
 *
 * Usage:
 *   const loader = new RenderContractRulesLoader()
 *   await loader.loadFromIndustryPack('path/to/industry-packs/industry.refinery.basic')
 *   const rules = loader.getRules()
 *   // rules can now be used by resolveIndustrialRenderContract
 */

import type { IndustrialRenderContract } from '@pascal-app/core/registry'

export type RenderRuleDefinition = {
  id: string
  priority: number
  roles?: string[]
  sourcePartKinds?: string[]
  tokenPatterns?: string[]
  kernel: string
  material: string
  runtimeEffects?: string[]
  instancingHint?: string
}

export type RenderRulesDocument = {
  schemaVersion: string
  rules: RenderRuleDefinition[]
}

export type IndustrialRenderRule = IndustrialRenderContract & {
  id: string
  priority: number
  roles?: readonly string[]
  sourcePartKinds?: readonly string[]
  tokenPatterns?: readonly RegExp[]
}

export class RenderContractRulesLoader {
  private rules: IndustrialRenderRule[] = []

  /**
   * Load render rules from an industry pack's quality-rules directory.
   * Looks for render-rules.json or quality-rules/render-rules.json.
   */
  async loadFromIndustryPack(packRoot: string): Promise<void> {
    const candidates = [
      `${packRoot}/quality-rules/render-rules.json`,
      `${packRoot}/render-rules.json`,
    ]

    for (const path of candidates) {
      try {
        const doc = await this.readJson<RenderRulesDocument>(path)
        this.loadFromDocument(doc)
        return
      } catch {
        // Try next candidate
      }
    }
  }

  /**
   * Load render rules from a standalone JSON file.
   */
  async loadFromFile(filePath: string): Promise<void> {
    const doc = await this.readJson<RenderRulesDocument>(filePath)
    this.loadFromDocument(doc)
  }

  /**
   * Load render rules from a document object.
   */
  loadFromDocument(doc: RenderRulesDocument): void {
    for (const rule of doc.rules ?? []) {
      this.registerRule(rule)
    }
  }

  /**
   * Register a single render rule.
   */
  registerRule(def: RenderRuleDefinition): void {
    const rule: IndustrialRenderRule = {
      id: def.id,
      priority: def.priority,
      roles: def.roles ?? [],
      sourcePartKinds: def.sourcePartKinds ?? [],
      tokenPatterns: (def.tokenPatterns ?? []).map((p) => new RegExp(p)),
      kernel: def.kernel as IndustrialRenderContract['kernel'],
      material: def.material as IndustrialRenderContract['material'],
      runtimeEffects: def.runtimeEffects ?? [],
      instancingHint: def.instancingHint,
    }

    // Remove existing rule with same id (replace semantics)
    this.rules = this.rules.filter((r) => r.id !== def.id)
    this.rules.push(rule)
  }

  /**
   * Get all loaded rules, sorted by priority (highest first).
   */
  getRules(): IndustrialRenderRule[] {
    return [...this.rules].sort((a, b) => b.priority - a.priority)
  }

  /**
   * Merge with hardcoded base rules.
   * Loaded rules take precedence over base rules with the same id.
   */
  mergeWithBaseRules(baseRules: IndustrialRenderRule[]): IndustrialRenderRule[] {
    const merged = new Map<string, IndustrialRenderRule>()

    // Base rules first (lower precedence)
    for (const rule of baseRules) {
      merged.set(rule.id, rule)
    }

    // Loaded rules override
    for (const rule of this.rules) {
      merged.set(rule.id, rule)
    }

    return [...merged.values()].sort((a, b) => b.priority - a.priority)
  }

  /**
   * Clear all loaded rules.
   */
  clear(): void {
    this.rules = []
  }

  private async readJson<T>(filePath: string): Promise<T> {
    if (typeof window !== 'undefined') {
      const response = await fetch(filePath)
      if (!response.ok) throw new Error(`Failed to fetch ${filePath}`)
      return response.json() as Promise<T>
    }
    const { readFile } = await import('node:fs/promises')
    const content = await readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  }
}

// ─── Global Instance ─────────────────────────────────────────────────────────

export const renderContractRulesLoader = new RenderContractRulesLoader()

/**
 * Convenience function to load rules from an industry pack and
 * return the merged rule set (base + loaded).
 */
export async function loadRenderRulesForIndustryPack(
  packRoot: string,
  baseRules: IndustrialRenderRule[],
): Promise<IndustrialRenderRule[]> {
  const loader = new RenderContractRulesLoader()
  await loader.loadFromIndustryPack(packRoot)
  return loader.mergeWithBaseRules(baseRules)
}
