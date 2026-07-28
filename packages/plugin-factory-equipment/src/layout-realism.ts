/**
 * Layout Realism
 *
 * Consumes quality-rules/layout-rules.json from an industry pack to provide:
 *  1. Zone-based ground material differentiation (zoneGroundMaterial)
 *  2. Minimum spacing (fire-safety) validation between stations (validateSpacing)
 *
 * The rules file is optional; callers get sensible defaults when it is absent.
 */

import type { LayoutStation, Profile } from './industry-pack-loader'

export type ZoneGroundMaterial = {
  zone: string
  material: string
  color: string
  roughness: number
}

export type SpacingRule = {
  id: string
  description?: string
  fromFamilies: string[]
  toFamilies: string[]
  minDistance: number
  severity: 'error' | 'warning'
}

export type LayoutRulesDocument = {
  schemaVersion: string
  zoneGroundMaterials?: ZoneGroundMaterial[]
  spacingRules?: SpacingRule[]
}

export type SpacingViolation = {
  ruleId: string
  severity: 'error' | 'warning'
  stationA: string
  stationB: string
  distance: number
  minDistance: number
  description?: string
}

const DEFAULT_GROUND: Omit<ZoneGroundMaterial, 'zone'> = {
  material: 'concrete-paved',
  color: '#c4c4cc',
  roughness: 0.9,
}

export class LayoutRealism {
  private zoneMaterials = new Map<string, ZoneGroundMaterial>()
  private spacingRules: SpacingRule[] = []

  async loadFromIndustryPack(packRoot: string): Promise<void> {
    try {
      const doc = await this.readJson<LayoutRulesDocument>(
        `${packRoot}/quality-rules/layout-rules.json`,
      )
      this.loadFromDocument(doc)
    } catch {
      // No layout rules in this pack — defaults apply
    }
  }

  loadFromDocument(doc: LayoutRulesDocument): void {
    for (const zm of doc.zoneGroundMaterials ?? []) {
      this.zoneMaterials.set(zm.zone, zm)
    }
    this.spacingRules = [...(doc.spacingRules ?? [])]
  }

  /**
   * Ground material for a zone name. Falls back to default concrete.
   */
  zoneGroundMaterial(
    zone: string | undefined,
  ): Omit<ZoneGroundMaterial, 'zone'> & { zone?: string } {
    if (zone) {
      const found = this.zoneMaterials.get(zone)
      if (found) return found
    }
    return { ...DEFAULT_GROUND, zone }
  }

  /**
   * All distinct zones with their ground materials (for scene generation).
   */
  listZoneGroundMaterials(): ZoneGroundMaterial[] {
    return [...this.zoneMaterials.values()]
  }

  getSpacingRules(): SpacingRule[] {
    return [...this.spacingRules]
  }

  /**
   * Validate pairwise station spacing on the XZ plane against the loaded rules.
   * A rule applies when one station's profile family is in fromFamilies and the
   * other's is in toFamilies (symmetric check both ways).
   */
  validateSpacing(
    stations: readonly LayoutStation[],
    profiles: ReadonlyMap<string, Profile> | readonly Profile[],
  ): SpacingViolation[] {
    const familyOf = this.buildFamilyLookup(profiles)
    const violations: SpacingViolation[] = []

    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        const a = stations[i]
        const b = stations[j]
        if (!a || !b) continue
        const famA = familyOf.get(a.profileId)
        const famB = familyOf.get(b.profileId)
        if (!famA || !famB) continue

        const dx = a.position[0] - b.position[0]
        const dz = a.position[2] - b.position[2]
        const distance = Math.sqrt(dx * dx + dz * dz)

        for (const rule of this.spacingRules) {
          const applies =
            (rule.fromFamilies.includes(famA) && rule.toFamilies.includes(famB)) ||
            (rule.fromFamilies.includes(famB) && rule.toFamilies.includes(famA))
          if (!applies) continue
          if (distance < rule.minDistance) {
            violations.push({
              ruleId: rule.id,
              severity: rule.severity,
              stationA: a.id,
              stationB: b.id,
              distance: Math.round(distance * 100) / 100,
              minDistance: rule.minDistance,
              description: rule.description,
            })
          }
        }
      }
    }
    return violations
  }

  private buildFamilyLookup(
    profiles: ReadonlyMap<string, Profile> | readonly Profile[],
  ): Map<string, string> {
    const map = new Map<string, string>()
    if (profiles instanceof Map) {
      for (const [id, profile] of profiles) map.set(id, profile.family)
    } else {
      for (const profile of profiles as readonly Profile[]) map.set(profile.id, profile.family)
    }
    return map
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

/**
 * Convenience: load layout rules and validate a layout in one call.
 */
export async function validateLayoutSpacing(
  packRoot: string,
  stations: readonly LayoutStation[],
  profiles: ReadonlyMap<string, Profile> | readonly Profile[],
): Promise<SpacingViolation[]> {
  const realism = new LayoutRealism()
  await realism.loadFromIndustryPack(packRoot)
  return realism.validateSpacing(stations, profiles)
}
