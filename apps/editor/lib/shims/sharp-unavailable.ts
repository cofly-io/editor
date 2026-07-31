function sharpUnavailable(): never {
  throw new Error(
    'The optional "sharp" package is not installed. Install sharp before using glTF texture transforms that decode or encode image pixels.',
  )
}

export default sharpUnavailable
