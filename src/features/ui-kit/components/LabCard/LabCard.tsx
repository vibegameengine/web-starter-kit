import styles from './LabCard.module.css'

type LabCardProps = {
  readonly description: string
  /** Where the card leads. The caller owns routing; the card just renders a link. */
  readonly href: string
  /** Kebab-case lab id, shown as the card's technical label. */
  readonly id: string
  /**
   * A real captured frame of the lab. Omit when none exists yet — the card then
   * says so plainly rather than dressing the gap up as decoration, because a
   * missing preview has to LOOK missing or it never gets captured.
   */
  readonly preview?: string
  readonly title: string
  readonly 'data-testid'?: string
}

/**
 * One lab in the DEV lab index: its own rendered frame, its name, and one line
 * on what it lets you see.
 *
 * The picture is the point. Nobody remembers which of thirty kebab-case names is
 * the one with the ragdoll in it — they remember what it looked like.
 */
export function LabCard({
  description,
  href,
  id,
  preview,
  title,
  'data-testid': testId,
}: LabCardProps) {
  return (
    <a className={styles.card} data-has-preview={preview ? 'true' : 'false'} data-testid={testId} href={href}>
      <span className={styles.thumb}>
        {preview ? (
          <img alt={`${title} preview`} className={styles.image} loading="lazy" src={preview} />
        ) : (
          <span className={styles.missing}>No preview captured</span>
        )}
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        <span className={styles.description}>{description}</span>
        <span className={styles.id}>{id}</span>
      </span>
    </a>
  )
}
