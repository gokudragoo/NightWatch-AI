import { CTASection } from "@/components/cta-section"
import { FeaturesSection } from "@/components/features-section"
import { HeroSection } from "@/components/hero-section"
import { NightWatchPageShell } from "@/components/nightwatch-page-shell"

export default function HomePage() {
  return (
    <NightWatchPageShell withTopPadding={false}>
      <HeroSection />
      <FeaturesSection />
      <CTASection />
    </NightWatchPageShell>
  )
}
