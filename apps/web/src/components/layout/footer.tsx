import { cn, focusRing, shellGutter } from '@/lib/utils'

export function Footer() {
  return (
    <footer className="border-t border-divider">
      <div
        className={cn(
          shellGutter,
          'flex flex-col items-center gap-2 py-5 text-center text-sm text-cream-400 sm:flex-row sm:justify-between sm:py-6 sm:text-left',
        )}
      >
        <p>
          ©{' '}
          {new Date().getFullYear()}{' '}
          <a
            href="https://camilasabino.dev"
            target="_blank"
            rel="noreferrer"
            className={cn(
              'rounded-control underline-offset-4 transition-colors hover:text-accent-fg hover:underline',
              focusRing,
            )}
          >
            Camila Sabino
          </a>
        </p>
        <a
          href="https://github.com/camilasabino/Blendify"
          target="_blank"
          rel="noreferrer"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-control transition-colors hover:text-accent-fg',
            focusRing,
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2C6.48 2 2 6.58 2 12.2c0 4.5 2.87 8.31 6.84 9.66.5.1.68-.22.68-.5 0-.24-.01-1.04-.01-1.89-2.78.51-3.5-.7-3.72-1.34-.13-.33-.68-1.34-1.16-1.62-.4-.22-.96-.75-.01-.76.89-.01 1.53.83 1.74 1.18 1.02 1.75 2.65 1.26 3.3.96.1-.75.4-1.26.72-1.55-2.53-.29-5.18-1.29-5.18-5.71 0-1.26.44-2.3 1.16-3.11-.12-.29-.5-1.48.11-3.07 0 0 .95-.31 3.12 1.19a10.6 10.6 0 0 1 5.68 0c2.17-1.5 3.12-1.19 3.12-1.19.61 1.59.23 2.78.11 3.07.72.81 1.16 1.84 1.16 3.11 0 4.43-2.66 5.42-5.19 5.71.41.36.77 1.06.77 2.15 0 1.55-.01 2.8-.01 3.18 0 .28.18.61.69.5A10.02 10.02 0 0 0 22 12.2C22 6.58 17.52 2 12 2Z" />
          </svg>
          GitHub
        </a>
      </div>
    </footer>
  )
}
