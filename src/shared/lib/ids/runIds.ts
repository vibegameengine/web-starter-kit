export interface RunIdAllocator {
  nextEntityId: number
}

export function allocateEntityId(allocator: RunIdAllocator): number {
  const id = allocator.nextEntityId
  allocator.nextEntityId += 1
  return id
}
