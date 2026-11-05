import { jwtDecode } from 'jwt-decode'

type JwtPayload = {
  exp: number
}

export const getTokenExpiry = (token: string): number | null => {
  try {
    const decoded = jwtDecode<JwtPayload>(token)
    return decoded.exp * 1000 // convert to ms
  } catch {
    return null
  }
}

export const isTokenExpired = (token: string): boolean => {
  const exp = getTokenExpiry(token)
  if (!exp) return true
  return Date.now() >= exp
}
