export interface Coords {
  lat: number
  lng: number
}

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported on this device/browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location permission denied. Enable it in your browser settings to check in.'))
        } else {
          reject(new Error('Could not get your location. Try again.'))
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}
