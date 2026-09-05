type Listener = () => void

let listeners: Listener[] = []

export const subscribeAuth = (listener: Listener) => {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

export const notifyAuthChanged = () => {
  listeners.forEach(l => l())
}
