/**
 * Copies text, reporting whether it worked.
 *
 * `navigator.clipboard` is only available in secure contexts, so over plain
 * HTTP it is missing entirely and the old selection trick is all there is.
 * Either way a failure is reported rather than thrown: copying a seed should
 * never break the game.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denied or an insecure context; try the fallback.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  } catch {
    return false
  }
}
