import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SKILLS_SOURCE_DIR = path.resolve('agents/skills')
const LINK_ROOTS = ['.claude/skills', '.codex/skills'] as const

export async function main(): Promise<void> {
  const skillNames = await readSkillNames()

  for (const linkRoot of LINK_ROOTS) {
    await syncLinkRoot(path.resolve(linkRoot), skillNames)
  }

  console.log(`Linked ${skillNames.length} agent skills.`)
}

async function readSkillNames(): Promise<string[]> {
  const entries = await fs.readdir(SKILLS_SOURCE_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

async function syncLinkRoot(linkRoot: string, skillNames: readonly string[]): Promise<void> {
  await fs.mkdir(linkRoot, { recursive: true })
  await removeStaleSkillLinks(linkRoot, new Set(skillNames))

  for (const skillName of skillNames) {
    await ensureSkillLink(linkRoot, skillName)
  }
}

async function removeStaleSkillLinks(
  linkRoot: string,
  validSkillNames: ReadonlySet<string>,
): Promise<void> {
  const entries = await fs.readdir(linkRoot, { withFileTypes: true })

  for (const entry of entries) {
    if (validSkillNames.has(entry.name)) {
      continue
    }

    const entryPath = path.join(linkRoot, entry.name)
    const stats = await fs.lstat(entryPath)

    if (stats.isSymbolicLink()) {
      await fs.rm(entryPath)
    }
  }
}

async function ensureSkillLink(linkRoot: string, skillName: string): Promise<void> {
  const sourcePath = path.join(SKILLS_SOURCE_DIR, skillName)
  const linkPath = path.join(linkRoot, skillName)
  const existingStats = await tryLstat(linkPath)

  if (existingStats) {
    if (!existingStats.isSymbolicLink()) {
      console.warn(`Skipped ${path.relative(process.cwd(), linkPath)}: not a symlink.`)
      return
    }

    const existingTarget = await fs.readlink(linkPath)
    if (path.resolve(linkRoot, existingTarget) === sourcePath) {
      return
    }

    await fs.rm(linkPath)
  }

  const linkTarget = process.platform === 'win32' ? sourcePath : path.relative(linkRoot, sourcePath)
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  await fs.symlink(linkTarget, linkPath, linkType)
}

async function tryLstat(filePath: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | null> {
  try {
    return await fs.lstat(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

const entryFilePath = process.argv[1]

if (entryFilePath && import.meta.url === pathToFileURL(entryFilePath).href) {
  main().catch((error: unknown) => {
    console.error('Failed to link agent skills.')
    console.error(error)
    process.exitCode = 1
  })
}
