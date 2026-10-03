/** Minimal Server-Sent Events parser. Feed it raw chunks; it emits whole events. */
export function createSseParser(onEvent: (data: string, event?: string) => void) {
  let buffer = ''
  const flushEvent = (raw: string) => {
    let event: string | undefined
    const data: string[] = []
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (data.length) onEvent(data.join('\n'), event)
  }
  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, '\n')
      let i: number
      while ((i = buffer.indexOf('\n\n')) >= 0) {
        flushEvent(buffer.slice(0, i))
        buffer = buffer.slice(i + 2)
      }
    },
    end() {
      if (buffer.trim()) flushEvent(buffer)
      buffer = ''
    },
  }
}
