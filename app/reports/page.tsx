import { NightWatchConsole } from "@/components/nightwatch-console"
import { NightWatchPageShell } from "@/components/nightwatch-page-shell"

export const metadata = {
  title: "Reports - NightWatch AI",
  description: "Review wallet-scoped Sleep Mode history, alerts, dry-runs, and execution audit records.",
}

export default function ReportsPage() {
  return (
    <NightWatchPageShell>
      <NightWatchConsole initialView="reports" requireWallet />
    </NightWatchPageShell>
  )
}
