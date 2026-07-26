const SLOT_PREFIX = 'slot:'

export function isSlotMaterialName(name: string): boolean {
  return name.startsWith(SLOT_PREFIX) && name.length > SLOT_PREFIX.length
}

export function deriveSlotId(name: string): string {
  if (!isSlotMaterialName(name)) {
    throw new Error(`Material name is not a slot: ${name}`)
  }
  return name.slice(SLOT_PREFIX.length)
}
