type PageHeaderProps = Readonly<{
  eyebrow: string
  title: string
  description?: string
}>

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="space-y-2">
      <p className="text-eyebrow text-accent-fg">{eyebrow}</p>
      <h1 className="font-display text-3xl font-bold tracking-tight text-cream-50 sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-2xl pt-1 text-base leading-relaxed text-cream-300">
          {description}
        </p>
      ) : null}
    </header>
  )
}
