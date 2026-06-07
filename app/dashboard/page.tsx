import { NightWatchConsole } from "@/components/nightwatch-console"
import { NightWatchPageShell } from "@/components/nightwatch-page-shell"

export const metadata = {
  title: "NightWatch Dashboard - Wallet Login",
  description: "Connect a wallet to run the NightWatch AI console with MongoDB-backed portfolio persistence.",
}

export default function DashboardPage() {
  return (
    <NightWatchPageShell>
      <NightWatchConsole requireWallet />
    </NightWatchPageShell>
  )
}
