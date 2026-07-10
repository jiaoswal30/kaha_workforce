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
 * Euclidean distance between two descriptors (lower = more similar).
 * The library's conventional same-person threshold is 0.6; we use 0.45 —
 * deliberately strict because look-alikes (siblings) are a real scenario
 * here. Cost: the right person may occasionally need a second attempt.
 */
export const FACE_MATCH_THRESHOLD = 0.45

export function faceDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

/**
 * Averages several descriptors of the same person into one, which is more
 * stable than any single capture (used at enrollment).
 */
export function averageDescriptors(samples: number[][]): number[] {
  const out = new Array<number>(samples[0].length).fill(0)
  for (const s of samples) for (let i = 0; i < s.length; i++) out[i] += s[i]
  return out.map((v) => v / samples.length)
}
