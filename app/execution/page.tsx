import { NightWatchConsole } from "@/components/nightwatch-console"
import { NightWatchPageShell } from "@/components/nightwatch-page-shell"

export const metadata = {
  title: "Execution - NightWatch AI",
  description: "Create wallet-safe SoDEX dry-runs, connect ValueChain, and submit approved protection orders.",
}

export default function ExecutionPage() {
  return (
    <NightWatchPageShell>
      <NightWatchConsole initialView="execution" requireWallet />
    </NightWatchPageShell>
  )
}
