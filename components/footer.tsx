"use client"
import type { ComponentProps, ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import Image from "next/image"

interface FooterLink {
  title: string
  href: string
}

interface FooterSection {
  label: string
  links: FooterLink[]
}

const footerLinks: FooterSection[] = [
  {
    label: "Product",
    links: [
      { title: "Risk Engine", href: "#features" },
      { title: "Live Console", href: "#console" },
      { title: "Dashboard", href: "/dashboard" },
      { title: "Sleep Mode", href: "#ai-team" },
    ],
  },
  {
    label: "Stack",
    links: [
      { title: "SoSoValue API", href: "https://sosovalue-1.gitbook.io/sosovalue-api-doc" },
      { title: "SoDEX Docs", href: "https://sodex.com/documentation" },
      { title: "OpenAI Responses", href: "https://platform.openai.com/docs/api-reference/responses" },
      { title: "ValueChain", href: "https://sodex.com/documentation/about-valuechain/how-valuechain-works" },
    ],
  },
  {
    label: "Resources",
    links: [
      { title: "Wave Roadmap", href: "#testimonials" },
      { title: "Protection Flow", href: "#console" },
      { title: "README", href: "https://github.com/gokudragoo/NightWatch-AI" },
      { title: "Demo", href: "/dashboard" },
    ],
  },
  {
    label: "Proof",
    links: [
      { title: "Wave Hacks", href: "https://app.akindo.io/wave-hacks/JBEQXgN4Zi2jA3wA" },
      { title: "SoSoValue Indexes", href: "https://ssi.sosovalue.com/en" },
      { title: "SoDEX Trading API", href: "https://sodex.com/documentation/trading-api/trading-api" },
      { title: "GitHub Repo", href: "https://github.com/gokudragoo/NightWatch-AI" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="md:rounded-t-6xl relative w-full max-w-6xl mx-auto flex flex-col items-center justify-center rounded-t-4xl border-t bg-[radial-gradient(35%_128px_at_50%_0%,theme(backgroundColor.white/8%),transparent)] px-6 py-12 lg:py-16">
      <div className="bg-foreground/20 absolute top-0 right-1/2 left-1/2 h-px w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full blur" />

      <div className="grid w-full gap-8 xl:grid-cols-3 xl:gap-8">
        <AnimatedContainer className="space-y-4">
          <Image src="/icon.svg" alt="NightWatch AI Logo" width={64} height={64} className="size-16" />
          <div className="text-muted-foreground mt-8 text-sm md:mt-0 md:block hidden">
            <p>© {new Date().getFullYear()} NightWatch AI. All rights reserved.</p>
          </div>
        </AnimatedContainer>

        <div className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-4 xl:col-span-2 xl:mt-0">
          {footerLinks.map((section, index) => (
            <AnimatedContainer key={section.label} delay={0.1 + index * 0.1}>
              <div className="mb-10 md:mb-0">
                <h3 className="text-xs">{section.label}</h3>
                <ul className="text-muted-foreground mt-4 space-y-2 text-sm">
                  {section.links.map((link) => (
                    <li key={link.title}>
                      <a
                        href={link.href}
                        target={link.href.startsWith("http") ? "_blank" : undefined}
                        rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                        className="hover:text-foreground inline-flex items-center transition-all duration-300"
                      >
                        {link.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimatedContainer>
          ))}
        </div>
      </div>

      <div className="md:hidden mt-8 text-center space-y-2">
        <p className="text-muted-foreground text-sm">© {new Date().getFullYear()} NightWatch AI. All rights reserved.</p>
        <p className="text-muted-foreground text-xs">Built for Wave Hacks</p>
      </div>

      <div className="hidden md:block mt-8 pt-6 border-t border-foreground/10 w-full">
        <p className="text-muted-foreground text-xs text-center">SoSoValue intelligence. OpenAI briefs. SoDEX execution. ValueChain signatures.</p>
      </div>
    </footer>
  )
}

type ViewAnimationProps = {
  delay?: number
  className?: ComponentProps<typeof motion.div>["className"]
  children: ReactNode
}

function AnimatedContainer({ className, delay = 0.1, children }: ViewAnimationProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return children
  }

  return (
    <motion.div
      initial={{ filter: "blur(4px)", translateY: -8, opacity: 0 }}
      whileInView={{ filter: "blur(0px)", translateY: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.8 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
