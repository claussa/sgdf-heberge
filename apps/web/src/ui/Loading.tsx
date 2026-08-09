import { HelpText } from './HelpText'

/** Attente sobre (chargement de /me dans les guards et le dispatcher). */
export function Loading() {
  return (
    <div className="loading fade">
      <HelpText>Chargement…</HelpText>
    </div>
  )
}
