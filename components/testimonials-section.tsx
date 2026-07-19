"use client"

import { useEffect, useRef } from "react"
import { TestimonialsColumn } from "@/components/ui/testimonials-column"

export function TestimonialsSection() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const elements = entry.target.querySelectorAll(".fade-in-element")
            elements.forEach((element, index) => {
              setTimeout(() => {
                element.classList.add("animate-fade-in-up")
              }, index * 300)
            })
          }
        })
      },
      { threshold: 0.1 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const testimonials = [
    {
      text: "Wave 1 ships the live dashboard, danger score, Sleep Mode, wallet connection, SoSoValue intelligence route, and SoDEX testnet market data.",
      name: "Wave 1",
      role: "Built now",
    },
    {
      text: "Wave 1 includes signed EIP-712 SoDEX spot order submission, gated by the user's wallet and SoDEX account state.",
      name: "On-chain MVP",
      role: "ValueChain testnet",
    },
    {
      text: "Wave 2 adds persistent portfolios, notification delivery, strategy templates, order history, signed dry-run receipts, and deeper SoDEX perps protection.",
      name: "Wave 2",
      role: "Shipped now",
    },
    {
      text: "Wave 2 upgrades the AI explanation layer with source snippets across ETF flows, news, sectors, SSI indexes, and SoDEX liquidity.",
      name: "AI Analyst",
      role: "Shipped now",
    },
    {
      text: "Wave 3 adds SoSoValue Macro catalysts, configurable tracked assets, SSI request limits, and a cleaner morning report.",
      name: "Wave 3",
      role: "Final pass shipped",
    },
    {
      text: "Wave 3 blocks wallet signing until the SoDEX EIP-712 verifying contract is configured, while dry-runs remain available.",
      name: "Execution Guard",
      role: "Production hardening",
    },
    {
      text: "The judging story is simple: market intelligence from SoSoValue becomes user-approved protection on SoDEX.",
      name: "Hack Fit",
      role: "Core criteria",
    },
    {
      text: "The demo path is memorable: connect wallet, activate Sleep Mode, watch danger score move, sign a protection order.",
      name: "Demo Flow",
      role: "Judge-ready",
    },
  ]

  return (
    <section id="testimonials" ref={sectionRef} className="relative pt-16 pb-16 px-4 sm:px-6 lg:px-8">
      {/* Grid Background */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header Section - Keep as user loves it */}
        <div className="text-center mb-16 md:mb-32">
          <div className="fade-in-element opacity-0 translate-y-8 transition-all duration-1000 ease-out inline-flex items-center gap-2 text-white/60 text-sm font-medium tracking-wider uppercase mb-6">
            <div className="w-8 h-px bg-white/30"></div>
            Build Roadmap
            <div className="w-8 h-px bg-white/30"></div>
          </div>
          <h2 className="fade-in-element opacity-0 translate-y-8 transition-all duration-1000 ease-out text-5xl md:text-6xl lg:text-7xl font-light text-white mb-8 tracking-tight text-balance">
            The waves we <span className="font-medium italic">ship</span>
          </h2>
          <p className="fade-in-element opacity-0 translate-y-8 transition-all duration-1000 ease-out text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            Wave 1 proved the live flow, Wave 2 added persistence and audit history, and Wave 3 is the final production pass.
          </p>
        </div>

        {/* Testimonials Carousel */}
        <div className="fade-in-element opacity-0 translate-y-8 transition-all duration-1000 ease-out relative flex justify-center items-center min-h-[600px] md:min-h-[800px] overflow-hidden">
          <div
            className="flex gap-8 max-w-6xl"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
            }}
          >
            <TestimonialsColumn testimonials={testimonials.slice(0, 4)} duration={15} className="flex-1" />
            <TestimonialsColumn
              testimonials={testimonials.slice(3, 7)}
              duration={12}
              className="flex-1 hidden md:block"
            />
            <TestimonialsColumn
              testimonials={testimonials.slice(4, 8)}
              duration={18}
              className="flex-1 hidden lg:block"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
