import styles from './GitHubCornerLink.module.css'

type GitHubCornerLinkProps = {
  readonly href: string
  readonly label: string
}

/** A conventional, compact GitHub source link for app/demo corners. */
export function GitHubCornerLink({ href, label }: GitHubCornerLinkProps) {
  return (
    <a
      aria-label={label}
      className={styles.link}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={label}
    >
      <svg aria-hidden="true" viewBox="0 0 250 250">
        <path className={styles.corner} d="M0 0h250v250L115 115h-15z" />
        <path
          className={styles.octocatArm}
          d="M128.3 109c-14.5-9.3-9.3-19.4-9.3-19.4 3-6.9 1.5-11 1.5-11-1.3-6.6 2.9-2.3 2.9-2.3 3.9 4.6 2.1 11 2.1 11-2.6 10.3 5.1 14.6 8.9 15.9"
        />
        <path
          className={styles.octocatBody}
          d="M115 115c-.1.1 3.7 1.5 4.8 3.4l13.9-17.4c3.2-1.8 6.2-2.6 8.5-2.4-8.4-10.6-14.7-24.2 1.6-40.6 4.7-4.6 10.2-6.8 15.9-7 0-.6 2.9-6.4 11.1-9.9 0 0 4.7 2.4 7.4 16.1 4.3 2.4 8.4 5.6 12.1 9.2 3.6 3.6 6.8 7.8 9.2 12.2 13.7 2.6 16.2 7.3 16.2 7.3-3.6 8.2-9.4 11.1-10.9 11.7-.3 5.8-2.4 11.2-7.1 15.9-16.4 16.4-30 10-40.6 1.6.2 2.3-.6 5.3-2.4 8.5l-13.9 13.9c1.9 1.1 3.3 4.9 3.4 4.8z"
        />
      </svg>
      <span className={styles.label}>{label}</span>
    </a>
  )
}
