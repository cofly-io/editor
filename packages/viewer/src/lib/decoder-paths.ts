const runtimeDecoderAssetsPath = process.env.NEXT_PUBLIC_RUNTIME_DECODER_ASSETS_PATH?.replace(
  /^\/+|\/+$/g,
  '',
)

function runtimeDecoderPath(directory: string, fallback: string): string {
  return runtimeDecoderAssetsPath ? `${runtimeDecoderAssetsPath}/${directory}/` : fallback
}

export function getKtx2TranscoderPath(): string {
  return runtimeDecoderPath('basis', 'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/')
}

export function getDracoDecoderPath(): string {
  return runtimeDecoderPath('draco', 'https://www.gstatic.com/draco/versioned/decoders/1.5.5/')
}
