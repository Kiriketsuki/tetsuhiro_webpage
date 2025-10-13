import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'

gsap.registerPlugin(ScrambleTextPlugin)

const CHARS = 'upperCase'

// Scrambles the text of an element and settles back on the original label.
export function useScramble() {
    const scramble = (el, duration = 0.6) => {
        if (!el) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const text = el.dataset.label || el.textContent
        el.dataset.label = text
        gsap.to(el, {
            duration,
            scrambleText: { text, chars: CHARS, speed: 0.6 },
            overwrite: true,
        })
    }

    return { scramble }
}
