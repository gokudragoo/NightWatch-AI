import type { ReactNode } from "react"
import Aurora from "@/components/Aurora"
import { Footer } from "@/components/footer"
import { GlassmorphismNav } from "@/components/glassmorphism-nav"

export function NightWatchPageShell({
  children,
  withTopPadding = true,
}: {
  children: ReactNode
  withTopPadding?: boolean
}) {
  return (
    <div className="min-h-screen overflow-hidden bg-black">
      <main className="relative min-h-screen overflow-hidden">
        <div className="fixed inset-0 h-full w-full">
          <Aurora colorStops={["#475569", "#64748b", "#475569"]} amplitude={1.2} blend={0.6} speed={0.8} />
        </div>
        <div className={`relative z-10 ${withTopPadding ? "pt-20" : ""}`}>
          <GlassmorphismNav />
          {children}
          <Footer />
        </div>
      </main>
    </div>
  )
}
