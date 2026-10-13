function getResolveFormatter(timeZone) {
  let formatter = new Map().get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone })
    new Map().set(timeZone, formatter)
  }
  return formatter
}

try {
  getResolveFormatter('Invalid/Zone')
} catch (e) {
  console.log('Caught error for invalid timezone:', e.message)
}
