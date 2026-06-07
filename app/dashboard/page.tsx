import Aurora from "@/components/Aurora"
import { Footer } from "@/components/footer"
import { GlassmorphismNav } from "@/components/glassmorphism-nav"
import { NightWatchConsole } from "@/components/nightwatch-console"

export const metadata = {
  title: "NightWatch Dashboard - Live Crypto Risk Console",
  description: "Run the NightWatch AI Wave 2 console with SoSoValue intelligence, OpenAI risk briefs, and SoDEX ValueChain execution.",
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-black overflow-hidden">
      <main className="min-h-screen relative overflow-hidden">
        <div className="fixed inset-0 w-full h-full">
          <Aurora colorStops={["#475569", "#64748b", "#475569"]} amplitude={1.2} blend={0.6} speed={0.8} />
        </div>
        <div className="relative z-10 pt-20">
          <GlassmorphismNav />
          <NightWatchConsole />
          <Footer />
        </div>
      </main>
    </div>
  )
}
