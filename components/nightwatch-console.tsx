"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, CheckCircle2, KeyRound, Moon, Radio, Shield, Sparkles, Wallet, Zap } from "lucide-react"
import { keccak256, toHex } from "viem"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { NightWatchIntel, ProtectionMode, SodexMarket, SodexTicker } from "@/lib/nightwatch/types"
import { VALUECHAIN_TESTNET } from "@/lib/nightwatch/valuechain"

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>
}

const modeCopy: Record<ProtectionMode, { label: string; tone: string; hedge: number }> = {
  safe: { label: "Safe", tone: "Fast exits, tight stops", hedge: 35 },
  balanced: { label: "Balanced", tone: "Measured hedges", hedge: 22 },
  aggressive: { label: "Aggressive", tone: "Wider stops, trend room", hedge: 12 },
}

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 100 ? 0 : 2,
  }).format(value)

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)

function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null
  return (window as Window & { ethereum?: EthereumProvider }).ethereum || null
}

function normalizeWalletSignature(signature: string) {
  const clean = signature.startsWith("0x") ? signature.slice(2) : signature
  const v = Number.parseInt(clean.slice(-2), 16)
  const normalizedV = v >= 27 ? (v - 27).toString(16).padStart(2, "0") : clean.slice(-2)
  return `0x${clean.slice(0, -2)}${normalizedV}`
}

export function NightWatchConsole() {
  const [mode, setMode] = useState<ProtectionMode>("balanced")
  const [sleepMode, setSleepMode] = useState(true)
  const [portfolioValue, setPortfolioValue] = useState(42000)
  const [intel, setIntel] = useState<NightWatchIntel | null>(null)
  const [market, setMarket] = useState<SodexMarket | null>(null)
  const [address, setAddress] = useState("")
  const [accountId, setAccountId] = useState("")
  const [selectedSymbol, setSelectedSymbol] = useState("vBTC_vUSDC")
  const [status, setStatus] = useState("NightWatch is warming up the risk engine.")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true

    async function load() {
      setIsLoading(true)
      const [intelResponse, marketResponse] = await Promise.all([
        fetch(`/api/nightwatch/intel?mode=${mode}`).then((res) => res.json()),
        fetch("/api/sodex/market").then((res) => res.json()),
      ])

      if (!mounted) return
      setIntel(intelResponse)
      setMarket(marketResponse)
      setIsLoading(false)
      setStatus(
        `${intelResponse.sourceStatus === "live" ? "Live SoSoValue" : "Fallback"} intelligence synced with ${marketResponse.sourceStatus === "live" ? "SoDEX testnet" : "cached"} execution routes.`,
      )
    }

    load().catch((error) => {
      setIsLoading(false)
      setStatus(error instanceof Error ? error.message : "Unable to refresh NightWatch data.")
    })

    const interval = window.setInterval(load, 45_000)
    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [mode])

  const selectedTicker = useMemo<SodexTicker | undefined>(
    () => market?.tickers.find((ticker) => ticker.symbol === selectedSymbol) || market?.tickers[0],
    [market, selectedSymbol],
  )

  const hedgeUsd = Math.round((portfolioValue * modeCopy[mode].hedge) / 100)
  const estimatedProtected = Math.round((portfolioValue * (intel?.score || 40)) / 140)
  const dangerScore = intel?.score || 0

  async function connectWallet() {
    const ethereum = getEthereum()
    if (!ethereum) {
      setStatus("No injected wallet found. Install MetaMask or open the app in a wallet browser.")
      return
    }

    const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[]
    const wallet = accounts[0] || ""
    setAddress(wallet)
    setStatus("Wallet connected. Pulling SoDEX account state.")

    const accountResponse = await fetch(`/api/sodex/account?address=${wallet}`).then((res) => res.json())
    const aid = accountResponse?.aid || accountResponse?.accountID || accountResponse?.accountId
    if (aid) setAccountId(String(aid))
  }

  async function switchToValueChain() {
    const ethereum = getEthereum()
    if (!ethereum) {
      setStatus("No wallet provider found.")
      return
    }

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: VALUECHAIN_TESTNET.chainIdHex }],
      })
      setStatus("Wallet switched to ValueChain testnet.")
    } catch (error) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: VALUECHAIN_TESTNET.chainIdHex,
            chainName: VALUECHAIN_TESTNET.chainName,
            nativeCurrency: VALUECHAIN_TESTNET.nativeCurrency,
            rpcUrls: [VALUECHAIN_TESTNET.rpcUrl],
            blockExplorerUrls: ["https://testnet-scan.valuechain.xyz"],
          },
        ],
      })
      setStatus("ValueChain testnet added to wallet.")
    }
  }

  async function signAndSubmitProtectionOrder() {
    const ethereum = getEthereum()
    if (!ethereum || !address || !selectedTicker || !accountId) {
      setStatus("Connect a wallet and load a SoDEX account before signing a protection order.")
      return
    }

    setIsSubmitting(true)
    try {
      await switchToValueChain()
      const nonce = Date.now()
      const notional = Math.max(8, hedgeUsd * 0.001)
      const quantity = Math.max(notional / Math.max(selectedTicker.lastPx, 1), 0.00001).toFixed(
        selectedTicker.symbol.includes("BTC") ? 5 : selectedTicker.symbol.includes("ETH") ? 4 : 3,
      )
      const clOrdID = `nightwatch-${nonce}`.slice(0, 36)
      const orderBody = {
        accountID: Number(accountId),
        orders: [
          {
            symbolID: selectedTicker.symbolID || 1,
            clOrdID,
            side: 2,
            type: 2,
            timeInForce: 3,
            quantity,
          },
        ],
      }
      const actionPayload = { type: "batchNewOrder", params: orderBody }
      const payloadHash = keccak256(toHex(JSON.stringify(actionPayload)))
      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          ExchangeAction: [
            { name: "payloadHash", type: "bytes32" },
            { name: "nonce", type: "uint64" },
          ],
        },
        domain: {
          name: "spot",
          version: "1",
          chainId: VALUECHAIN_TESTNET.chainId,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
        primaryType: "ExchangeAction",
        message: {
          payloadHash,
          nonce,
        },
      }

      const rawSignature = (await ethereum.request({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(typedData)],
      })) as string
      const signature = `0x01${normalizeWalletSignature(rawSignature).slice(2)}`

      const result = await fetch("/api/sodex/submit-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: orderBody, nonce, signature }),
      }).then((res) => res.json())

      setStatus(result.ok ? `SoDEX testnet protection order submitted: ${clOrdID}` : result.error)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Signature or SoDEX submission failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section id="console" className="relative z-10 py-16 sm:py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-medium mb-6">
            <Radio className="w-4 h-4" />
            Live NightWatch Console
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 text-balance">
            AI risk control with{" "}
            <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              SoSoValue + SoDEX
            </span>
          </h2>
          <p className="text-lg text-white/70 max-w-3xl mx-auto leading-relaxed">
            The guardian reads market intelligence, scores danger, and prepares signed ValueChain protection orders when
            Sleep Mode is active.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-8 items-stretch">
          <div className="rounded-3xl border border-white/15 bg-[radial-gradient(35%_128px_at_50%_0%,theme(backgroundColor.white/15%),theme(backgroundColor.white/5%))] backdrop-blur-md p-5 sm:p-7 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <div className="text-white/60 text-sm">Market Danger Score</div>
                <div className="flex items-end gap-3">
                  <span className="text-6xl font-bold text-white">{isLoading ? "--" : dangerScore}</span>
                  <span className="pb-2 text-white/70">{intel?.level || "Syncing"}</span>
                </div>
              </div>
              <button
                onClick={() => setSleepMode((value) => !value)}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-medium transition-all duration-300 hover:scale-105 ${
                  sleepMode ? "bg-white text-black" : "bg-white/10 text-white border border-white/20"
                }`}
              >
                <Moon className="w-4 h-4" />
                {sleepMode ? "Sleep Mode Active" : "Sleep Mode Off"}
              </button>
            </div>

            <div className="h-3 w-full rounded-full bg-white/10 overflow-hidden mb-6">
              <div
                className="h-full rounded-full bg-gradient-to-r from-white via-slate-300 to-red-300 transition-all duration-700"
                style={{ width: `${dangerScore}%` }}
              />
            </div>

            <p className="text-white/75 leading-relaxed mb-8">{intel?.summary || status}</p>

            <div className="grid sm:grid-cols-3 gap-3 mb-8">
              {(intel?.actions || []).map((action) => (
                <div key={action.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-white font-semibold mb-2">
                    <Shield className="w-4 h-4" />
                    {action.title}
                  </div>
                  <p className="text-sm text-white/65 leading-relaxed">{action.description}</p>
                  <div className="mt-3 text-xs uppercase tracking-wide text-white/45">{action.status}</div>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {intel?.assets.map((asset) => (
                <div key={asset.symbol} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-semibold">{asset.symbol}</span>
                    <span className={asset.changePct24h < 0 ? "text-red-300" : "text-green-300"}>
                      {asset.changePct24h.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">{formatUsd(asset.price)}</div>
                  <div className="text-xs text-white/45 mt-1">Vol {formatCompact(asset.volume24h)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/15 bg-white text-slate-950 p-5 sm:p-7 shadow-2xl">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <div className="text-sm text-slate-500">Protection mode</div>
                  <h3 className="text-2xl font-bold">Overnight policy</h3>
                </div>
                <Sparkles className="w-6 h-6 text-slate-500" />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-6">
                {(Object.keys(modeCopy) as ProtectionMode[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setMode(item)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition-all duration-300 ${
                      mode === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {modeCopy[item].label}
                  </button>
                ))}
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-sm mb-3">
                    <span className="text-slate-600">Portfolio value</span>
                    <span className="font-semibold">{formatUsd(portfolioValue)}</span>
                  </div>
                  <Slider
                    value={[portfolioValue]}
                    min={2_000}
                    max={250_000}
                    step={1_000}
                    onValueChange={([value]) => setPortfolioValue(value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-100 p-4">
                    <div className="text-sm text-slate-500">Hedge budget</div>
                    <div className="text-2xl font-bold">{formatUsd(hedgeUsd)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-950 text-white p-4">
                    <div className="text-sm text-white/55">Est. protected</div>
                    <div className="text-2xl font-bold">{formatUsd(estimatedProtected)}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                    <p className="text-sm text-slate-600 leading-relaxed">{modeCopy[mode].tone}. Orders stay local until the wallet signs the EIP-712 SoDEX payload.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/15 bg-[radial-gradient(35%_128px_at_50%_0%,theme(backgroundColor.white/15%),theme(backgroundColor.white/5%))] backdrop-blur-md p-5 sm:p-7">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <div className="text-sm text-white/50">SoDEX execution</div>
                  <h3 className="text-2xl font-bold text-white">ValueChain safety order</h3>
                </div>
                <Zap className="w-6 h-6 text-white/60" />
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                <button
                  onClick={connectWallet}
                  className="rounded-full bg-white text-black px-5 py-3 font-medium inline-flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105"
                >
                  <Wallet className="w-4 h-4" />
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connect wallet"}
                </button>
                <button
                  onClick={switchToValueChain}
                  className="rounded-full bg-white/10 text-white border border-white/15 px-5 py-3 font-medium inline-flex items-center justify-center gap-2 transition-all duration-300 hover:bg-white/15"
                >
                  <KeyRound className="w-4 h-4" />
                  ValueChain
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                <input
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  placeholder="SoDEX account ID"
                  className="rounded-2xl bg-black/25 border border-white/10 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-white/30"
                />
                <select
                  value={selectedTicker?.symbol || selectedSymbol}
                  onChange={(event) => setSelectedSymbol(event.target.value)}
                  className="rounded-2xl bg-black/25 border border-white/10 px-4 py-3 text-white outline-none focus:border-white/30"
                >
                  {market?.tickers.map((ticker) => (
                    <option key={ticker.symbol} value={ticker.symbol} className="bg-slate-950">
                      {ticker.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 mb-5">
                <div className="flex items-center justify-between text-sm text-white/60 mb-2">
                  <span>{selectedTicker?.displayName || "BTC/USDC"}</span>
                  <span>{selectedTicker ? `${selectedTicker.changePct.toFixed(2)}%` : "--"}</span>
                </div>
                <div className="text-3xl font-bold text-white">
                  {selectedTicker ? formatUsd(selectedTicker.lastPx) : "Syncing"}
                </div>
              </div>

              <Button
                onClick={signAndSubmitProtectionOrder}
                disabled={isSubmitting}
                className="w-full bg-white text-black rounded-full px-6 py-6 text-base font-semibold transition-all duration-300 hover:bg-gray-50 hover:scale-[1.01] group"
              >
                {isSubmitting ? "Submitting to SoDEX..." : "Sign & submit testnet protection order"}
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>

              <div className="mt-4 flex items-start gap-3 text-sm text-white/60">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{status}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3 mt-6">
          {intel?.signals.map((signal) => (
            <div key={signal.label} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
              <div className="text-xs uppercase tracking-wide text-white/40 mb-2">{signal.label}</div>
              <div className="text-white font-semibold">{signal.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
