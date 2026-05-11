"use client"

import { useEffect, useMemo, useState } from "react"
import { Clock, DollarSign, Shield, TrendingDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"

interface SimulatorInputs {
  portfolioValue: number
  volatileExposure: number
  crashMove: number
  hedgeCoverage: number
}

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)

export function ROICalculatorSection() {
  const [inputs, setInputs] = useState<SimulatorInputs>({
    portfolioValue: 50000,
    volatileExposure: 72,
    crashMove: 14,
    hedgeCoverage: 35,
  })
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setIsVisible(true)
        })
      },
      { threshold: 0.1 },
    )

    const section = document.getElementById("roi-calculator")
    if (section) observer.observe(section)

    return () => observer.disconnect()
  }, [])

  const simulation = useMemo(() => {
    const exposedCapital = inputs.portfolioValue * (inputs.volatileExposure / 100)
    const unprotectedLoss = exposedCapital * (inputs.crashMove / 100)
    const protectedLoss = unprotectedLoss * (1 - inputs.hedgeCoverage / 100)
    const estimatedSavings = unprotectedLoss - protectedLoss
    const morningPortfolio = inputs.portfolioValue - protectedLoss
    const health = Math.max(0, Math.round((morningPortfolio / inputs.portfolioValue) * 100))

    return { exposedCapital, unprotectedLoss, protectedLoss, estimatedSavings, morningPortfolio, health }
  }, [inputs])

  return (
    <section id="roi-calculator" className="py-16 md:py-20 px-4 relative">
      <div className="max-w-6xl mx-auto">
        <div
          className={`text-center mb-12 md:mb-16 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-white/80">Protection Simulator</span>
          </div>

          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6 text-balance">
            Estimate the damage{" "}
            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              NightWatch can reduce
            </span>
          </h2>

          <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto text-balance">
            Model an overnight drawdown and see how much downside a protection policy can absorb.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-10 items-stretch">
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <Card className="p-6 md:p-8 bg-[radial-gradient(35%_128px_at_50%_0%,theme(backgroundColor.white/15%),theme(backgroundColor.white/5%))] border-white/20 backdrop-blur-sm shadow-2xl h-full flex flex-col">
              <h3 className="text-xl md:text-2xl font-semibold text-white mb-6 md:mb-8">Portfolio Inputs</h3>

              <div className="space-y-8 flex-1">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Portfolio Value: <span className="text-white font-semibold">{formatUsd(inputs.portfolioValue)}</span>
                  </label>
                  <Slider
                    value={[inputs.portfolioValue]}
                    onValueChange={([value]) => setInputs((prev) => ({ ...prev, portfolioValue: value }))}
                    max={500000}
                    min={2000}
                    step={1000}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Volatile Exposure:{" "}
                    <span className="text-white font-semibold">{inputs.volatileExposure}%</span>
                  </label>
                  <Slider
                    value={[inputs.volatileExposure]}
                    onValueChange={([value]) => setInputs((prev) => ({ ...prev, volatileExposure: value }))}
                    max={100}
                    min={10}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Overnight Drawdown: <span className="text-white font-semibold">{inputs.crashMove}%</span>
                  </label>
                  <Slider
                    value={[inputs.crashMove]}
                    onValueChange={([value]) => setInputs((prev) => ({ ...prev, crashMove: value }))}
                    max={40}
                    min={2}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Hedge Coverage: <span className="text-white font-semibold">{inputs.hedgeCoverage}%</span>
                  </label>
                  <Slider
                    value={[inputs.hedgeCoverage]}
                    onValueChange={([value]) => setInputs((prev) => ({ ...prev, hedgeCoverage: value }))}
                    max={80}
                    min={5}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-700/50">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <p className="text-sm text-gray-300">
                      Safe mode increases hedge coverage; aggressive mode keeps more upside open.
                    </p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <p className="text-sm text-gray-300">
                      SoDEX orders are prepared as signed ValueChain payloads and submitted only after wallet approval.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div
            className={`transition-all duration-700 delay-400 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <Card className="p-6 md:p-8 bg-[radial-gradient(35%_128px_at_50%_0%,theme(backgroundColor.white/15%),theme(backgroundColor.white/5%))] border-white/20 backdrop-blur-sm shadow-2xl h-full flex flex-col">
              <h3 className="text-xl md:text-2xl font-semibold text-white mb-6 md:mb-8">
                Overnight Protection Result
              </h3>

              <div className="space-y-6 flex-1">
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="text-center p-3 md:p-4 rounded-lg bg-gray-700/30">
                    <div className="text-xs md:text-sm text-gray-400 mb-1">Without NightWatch</div>
                    <div className="text-xl md:text-2xl font-bold text-white">
                      -{formatUsd(simulation.unprotectedLoss)}
                    </div>
                    <div className="text-xs text-gray-400">possible loss</div>
                  </div>
                  <div className="text-center p-3 md:p-4 rounded-lg bg-white/10 border border-white/20">
                    <div className="text-xs md:text-sm text-gray-300 mb-1">With NightWatch</div>
                    <div className="text-xl md:text-2xl font-bold text-white">-{formatUsd(simulation.protectedLoss)}</div>
                    <div className="text-xs text-gray-300">protected loss</div>
                  </div>
                </div>

                <div className="space-y-3 md:space-y-4">
                  <div className="flex items-center justify-between p-3 md:p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-gray-300" />
                      <span className="text-sm md:text-base text-white">Estimated Savings</span>
                    </div>
                    <span className="text-lg md:text-xl font-bold text-white">
                      {formatUsd(simulation.estimatedSavings)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 md:p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <TrendingDown className="w-4 h-4 md:w-5 md:h-5 text-gray-300" />
                      <span className="text-sm md:text-base text-white">Exposed Capital</span>
                    </div>
                    <span className="text-lg md:text-xl font-bold text-white">
                      {formatUsd(simulation.exposedCapital)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 md:p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 md:w-5 md:h-5 text-gray-300" />
                      <span className="text-sm md:text-base text-white">Morning Health</span>
                    </div>
                    <span className="text-lg md:text-xl font-bold text-white">{simulation.health}%</span>
                  </div>
                </div>

                <div className="mt-6 md:mt-8 p-4 md:p-6 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-center">
                    <div className="text-xs md:text-sm text-gray-300 mb-2">Portfolio After Protected Event</div>
                    <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2">
                      {formatUsd(simulation.morningPortfolio)}
                    </div>
                    <div className="text-xs md:text-sm text-gray-400">
                      Simulation only; real results depend on liquidity, fills, slippage, and signed execution timing.
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
