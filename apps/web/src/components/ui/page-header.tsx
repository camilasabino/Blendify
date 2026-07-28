type PageHeaderProps = {
  eyebrow: string
  title: string
  description?: string
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="space-y-2">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-amber-500">
        {eyebrow}
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tight text-cream-50 sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-lg text-cream-400">{description}</p>
      ) : null}
    </header>
  )
}
