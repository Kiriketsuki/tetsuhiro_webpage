import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'

gsap.registerPlugin(ScrambleTextPlugin)

const CHARS = 'upperCase'

// Scrambles the text of an element and settles back on the original label.
// The nav uses the uppercase default. The hero title passes lowerCase, so the
// serif words decode from letters that look like them.
export function useScramble() {
    const scramble = (el, duration = 0.6, { chars = CHARS, delay = 0, speed = 0.6 } = {}) => {
        if (!el) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const text = el.dataset.label || el.textContent
        el.dataset.label = text
        gsap.to(el, {
            duration,
            delay,
            scrambleText: { text, chars, speed, revealDelay: duration * 0.3 },
            overwrite: true,
        })
    }

    return { scramble }
}
