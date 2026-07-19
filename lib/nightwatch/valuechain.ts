export const UNCONFIGURED_SPOT_VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000000"

function readEvmAddress(value: string | undefined, fallback: string) {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value : fallback
}

export const VALUECHAIN_TESTNET = {
  chainId: 138565,
  chainIdHex: "0x21d45",
  chainName: "ValueChain Testnet",
  rpcUrl: "https://testnet.valuechain.xyz",
  nativeCurrency: {
    name: "SOSO",
    symbol: "SOSO",
    decimals: 18,
  },
  spotVerifyingContract: readEvmAddress(
    process.env.NEXT_PUBLIC_SODEX_SPOT_VERIFYING_CONTRACT,
    UNCONFIGURED_SPOT_VERIFYING_CONTRACT,
  ),
}

export function isValueChainSpotSigningConfigured() {
  return VALUECHAIN_TESTNET.spotVerifyingContract !== UNCONFIGURED_SPOT_VERIFYING_CONTRACT
}
