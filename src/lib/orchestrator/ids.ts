export function revisionStem(id: string): string {
  return id.replace(/_r\d+(_\d+)?$/, '')
}

export function nextNodeId(baseId: string, round: number, existing: Set<string>): string {
  const stem = revisionStem(baseId)
  let collision = 1

  while (true) {
    const suffix = collision === 1 ? `_r${round}` : `_r${round}_${collision}`
    const candidate = `${stem.slice(0, Math.max(1, 32 - suffix.length))}${suffix}`
    if (!existing.has(candidate)) {
      return candidate
    }
    collision += 1
  }
}
