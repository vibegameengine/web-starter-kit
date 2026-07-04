import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type ReleaseType = 'major' | 'minor' | 'patch'

type PackageJson = {
  version: string
}

type PackageLockJson = {
  version?: string
  packages?: {
    ''?: {
      version?: string
    }
  }
}

const RELEASE_TYPES: readonly ReleaseType[] = ['major', 'minor', 'patch']

export async function main(): Promise<void> {
  const releaseType = parseReleaseType(process.argv[2])
  const packageJsonPath = path.resolve('package.json')
  const packageLockPath = path.resolve('package-lock.json')

  const packageJson = await readJson<PackageJson>(packageJsonPath)
  const currentVersion = packageJson.version
  const nextVersion = bumpVersion(currentVersion, releaseType)

  packageJson.version = nextVersion
  await writeJson(packageJsonPath, packageJson)

  try {
    const packageLock = await readJson<PackageLockJson>(packageLockPath)
    packageLock.version = nextVersion
    if (packageLock.packages?.['']) {
      packageLock.packages[''].version = nextVersion
    }
    await writeJson(packageLockPath, packageLock)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  console.log(`${currentVersion} -> ${nextVersion}`)
}

export function parseReleaseType(rawValue: string | undefined): ReleaseType {
  if (rawValue === 'major' || rawValue === 'minor' || rawValue === 'patch') {
    return rawValue
  }

  const allowedValues = RELEASE_TYPES.join(', ')
  throw new Error(`Pass a release type: ${allowedValues}`)
}

export function bumpVersion(version: string, releaseType: ReleaseType): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`Version "${version}" is not semver x.y.z`)
  }

  const major = Number.parseInt(match[1], 10)
  const minor = Number.parseInt(match[2], 10)
  const patch = Number.parseInt(match[3], 10)

  if (releaseType === 'major') {
    return `${major + 1}.0.0`
  }

  if (releaseType === 'minor') {
    return `${major}.${minor + 1}.0`
  }

  return `${major}.${minor}.${patch + 1}`
}

async function readJson<TValue>(filePath: string): Promise<TValue> {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as TValue
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const output = `${JSON.stringify(value, null, 2)}\n`
  await fs.writeFile(filePath, output, 'utf8')
}

const entryFilePath = process.argv[1]

if (entryFilePath && import.meta.url === pathToFileURL(entryFilePath).href) {
  main().catch((error: unknown) => {
    console.error('Failed to bump the version.')
    console.error(error)
    process.exitCode = 1
  })
}
