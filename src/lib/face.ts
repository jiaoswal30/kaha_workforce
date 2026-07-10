// Browser-side face recognition via @vladmandic/face-api (TensorFlow.js).
// Dynamically imported so the ~7MB of models/runtime only load on pages that
// actually use the camera (kiosk, Team enrollment) — never on normal pages.

let api: typeof import('@vladmandic/face-api') | null = null

async function loadModels() {
  if (api) return api
  const faceapi = await import('@vladmandic/face-api')
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  ])
  api = faceapi
  return faceapi
}

/** Kick off model loading early (e.g. when the camera screen mounts). */
export function preloadFaceModels() {
  loadModels().catch(() => {})
}

/**
 * Detects the most prominent face in the input and returns its 128-number
 * descriptor, or null when no face is found.
 */
export async function computeFaceDescriptor(
  input: HTMLVideoElement | HTMLCanvasElement
): Promise<number[] | null> {
  const faceapi = await loadModels()
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
  if (!detection) return null
  return Array.from(detection.descriptor)
}

/**
 * Whether two descriptors belong to the same person. 0.6 is the library's
 * conventional euclidean-distance threshold; we use 0.55 (slightly stricter)
 * to favor rejecting an imposter over accepting a bad match.
 */
export function facesMatch(a: number[], b: number[]): boolean {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum) < 0.55
}
