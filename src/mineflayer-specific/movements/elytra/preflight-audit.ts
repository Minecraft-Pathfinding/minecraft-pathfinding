export interface ElytraResourceAuditInput {
  distance2D: number
  cruiseSpeed: number
  unbreakingLevel: number
  durability: number
  rockets: number
  safetyMarginTicks?: number
}

export interface ElytraResourceAuditResult {
  requiredDurability: number
  requiredRockets: number
  sufficientDurability: boolean
  sufficientRockets: boolean
  accepted: boolean
  reason?: 'invalid-cruise-speed' | 'durability' | 'rockets'
}

export function damageRatePerTick(unbreakingLevel: number): number {
  const level = Math.max(0, Math.min(3, Math.floor(unbreakingLevel)))
  return 1 / (level + 1)
}

export function auditElytraResources(
  input: ElytraResourceAuditInput
): ElytraResourceAuditResult {
  if (
    !Number.isFinite(input.distance2D) ||
    input.distance2D < 0 ||
    !Number.isFinite(input.cruiseSpeed) ||
    input.cruiseSpeed <= 0
  ) {
    return {
      requiredDurability: Infinity,
      requiredRockets: Infinity,
      sufficientDurability: false,
      sufficientRockets: false,
      accepted: false,
      reason: 'invalid-cruise-speed'
    }
  }
  const margin = Math.max(0, input.safetyMarginTicks ?? 20)
  const ticks = Math.ceil(input.distance2D / input.cruiseSpeed) + margin
  const requiredDurability = Math.ceil(
    ticks * damageRatePerTick(input.unbreakingLevel)
  )
  const requiredRockets = Math.ceil(ticks / 20)
  const sufficientDurability = input.durability >= requiredDurability
  const sufficientRockets = input.rockets >= requiredRockets
  return {
    requiredDurability,
    requiredRockets,
    sufficientDurability,
    sufficientRockets,
    accepted: sufficientDurability && sufficientRockets,
    reason: !sufficientDurability
      ? 'durability'
      : !sufficientRockets
        ? 'rockets'
        : undefined
  }
}
