import { useMemo, useState } from 'react'
import { Link, useHref } from 'react-router-dom'

import { useReportInitialRenderReady } from '../../../features/bootstrap'
import { LabCard } from '../../../features/ui-kit'
import { DEV_LABS, groupDevLabs } from '../../labs/labRegistry'
import styles from './LabsScreen.module.css'

/**
 * The DEV lab index (`dev-lab-authoring`, rule 4): every registered lab as a
 * card with its own captured frame.
 *
 * It is a picture grid rather than a list of links on purpose — with thirty
 * labs, the name is not what anyone remembers.
 */
export function LabsScreen() {
  useReportInitialRenderReady()

  // Resolved through the router, ONCE, because the cards are plain anchors and a
  // raw `/labs/<id>` ignores the app's basename: on a project Pages deployment
  // every card pointed at the domain root and the whole index became unusable
  // from the UI, while typing the same URL by hand worked. One call, then string
  // concatenation — `useHref` is a hook and cards are a list.
  const labsHref = useHref('/labs')

  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groupDevLabs()
    return groupDevLabs(
      DEV_LABS.filter((lab) =>
        `${lab.title} ${lab.id} ${lab.description}`.toLowerCase().includes(needle),
      ),
    )
  }, [query])

  const captured = DEV_LABS.filter((lab) => lab.preview).length

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DEV LABS</p>
          <h1 className={styles.title}>Isolated feature labs</h1>
          <p className={styles.subtitle}>
            One route per system, each showing it on the shared lab stage with nothing else in the
            frame. {DEV_LABS.length} registered · {captured} with a captured preview.
          </p>
        </div>
        <div className={styles.headerSide}>
          <input
            aria-label="Filter labs"
            className={styles.search}
            data-testid="labs-filter"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter labs…"
            type="search"
            value={query}
          />
          <div className={styles.links}>
            <Link className={styles.link} data-testid="labs-link-game" to="/">
              Game ↗
            </Link>
            <Link className={styles.link} data-testid="labs-link-ui-kit" to="/ui-kit">
              UI kit ↗
            </Link>
          </div>
        </div>
      </header>

      {groups.length === 0 ? (
        <p className={styles.empty} data-testid="labs-empty">
          No lab matches “{query}”.
        </p>
      ) : (
        groups.map((group) => (
          <section className={styles.group} key={group.category}>
            <h2 className={styles.groupTitle}>
              {group.title} <span className={styles.groupCount}>{group.labs.length}</span>
            </h2>
            <div className={styles.grid} data-testid={`labs-group-${group.category}`}>
              {group.labs.map((lab) => (
                <LabCard
                  data-testid={`labs-card-${lab.id}`}
                  description={lab.description}
                  href={`${labsHref}/${lab.id}`}
                  id={lab.id}
                  key={lab.id}
                  preview={lab.preview}
                  title={lab.title}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  )
}
