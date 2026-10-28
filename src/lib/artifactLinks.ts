/** Remote preview links must be deliberately approved. Loopback is desktop-only. */
export function artifactLink(raw: string, remoteApproved = false): { usable: boolean; mobile: boolean; reason: string } {
  try {
    const u = new URL(raw)
    if (u.username || u.password || !['http:', 'https:'].includes(u.protocol)) return { usable: false, mobile: false, reason: 'Unsafe URL or embedded credentials' }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    if (local) return { usable: true, mobile: false, reason: 'Desktop-only loopback preview. Send actual media for phone review.' }
    if (u.protocol !== 'https:' || !remoteApproved) return { usable: false, mobile: false, reason: 'Remote previews need explicit access-control and publication approval' }
    return { usable: true, mobile: true, reason: 'Owner-approved HTTPS destination; access still depends on its authorization' }
  } catch { return { usable: false, mobile: false, reason: 'Invalid destination' } }
}
