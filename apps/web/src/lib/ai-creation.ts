export function isAiCreationEnabled(
  env: Pick<ImportMetaEnv, 'VITE_AI_CREATION_ENABLED' | 'DEV'> = import.meta.env,
): boolean {
  const flag = env.VITE_AI_CREATION_ENABLED?.trim()
  if (flag) {
    return flag === 'true'
  }
  return env.DEV
}
