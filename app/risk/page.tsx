import { NightWatchConsole } from "@/components/nightwatch-console"
import { NightWatchPageShell } from "@/components/nightwatch-page-shell"

export const metadata = {
  title: "Risk Engine - NightWatch AI",
  description: "Wallet-gated NightWatch risk score, SoSoValue intelligence, OpenAI brief, and source evidence.",
}

export default function RiskPage() {
  return (
    <NightWatchPageShell>
      <NightWatchConsole initialView="risk" requireWallet />
    </NightWatchPageShell>
  )
}
