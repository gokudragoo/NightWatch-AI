import { AITeamSection } from "@/components/ai-team-section"
import { CTASection } from "@/components/cta-section"
import { ProblemSolutionSection } from "@/components/problem-solution-section"
import { ROICalculatorSection } from "@/components/roi-calculator-section"
import { TestimonialsSection } from "@/components/testimonials-section"
import { NightWatchPageShell } from "@/components/nightwatch-page-shell"

export const metadata = {
  title: "Roadmap - NightWatch AI",
  description: "NightWatch AI Wave 2 proof, SoSoValue and SoDEX architecture, and roadmap for wallet-safe autonomous risk control.",
}

export default function RoadmapPage() {
  return (
    <NightWatchPageShell>
      <ProblemSolutionSection />
      <AITeamSection />
      <TestimonialsSection />
      <ROICalculatorSection />
      <CTASection />
    </NightWatchPageShell>
  )
}
