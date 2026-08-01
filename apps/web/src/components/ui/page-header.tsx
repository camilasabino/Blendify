type PageHeaderProps = Readonly<{
  eyebrow: string
  title: string
  description?: string
}>

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="relative space-y-3">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-6 -top-8 size-36 rounded-full bg-amber-500/20 blur-3xl"
      />
      <p className="relative text-sm font-medium uppercase tracking-[0.18em] text-amber-400">
        {eyebrow}
      </p>
      <h1 className="relative font-display text-3xl font-bold tracking-tight text-cream-50 sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="relative max-w-none text-base leading-relaxed text-cream-300 sm:max-w-3xl">
          {description}
        </p>
      ) : null}
    </header>
  )
}
