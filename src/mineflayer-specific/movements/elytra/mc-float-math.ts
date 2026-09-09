const TABLE_SIZE = 65536
const INDEX_SCALE = Math.fround(10430.378)
const SIN_TABLE = new Float32Array(TABLE_SIZE)

for (let index = 0; index < TABLE_SIZE; index++) {
  SIN_TABLE[index] = Math.fround(Math.sin((index * Math.PI * 2) / TABLE_SIZE))
}

function tableIndex(value: number, offset: number): number {
  return Math.trunc(Math.fround(value * INDEX_SCALE + offset)) & 0xffff
}

export function mcSin(value: number): number {
  return SIN_TABLE[tableIndex(value, 0)]
}

export function mcCos(value: number): number {
  return SIN_TABLE[tableIndex(value, 16384)]
}

export function mcFloat(value: number): number {
  return Math.fround(value)
}

export function mcAdd(left: number, right: number): number {
  return Math.fround(left + right)
}

export function mcMultiply(left: number, right: number): number {
  return Math.fround(left * right)
}

export function mcDivide(left: number, right: number): number {
  return Math.fround(left / right)
}

export const MC_SIN_TABLE_SIZE = TABLE_SIZE
