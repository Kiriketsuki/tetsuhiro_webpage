// The detail sheet for one pin in the wall lab: what it is, the stack, the screenshots and a
// link out. A wide screen shows it as a paper sheet on the right. A phone shows it as a sheet
// from the bottom. It is plain HTML, so the text stays sharp at every zoom.

const CSS = `
.wall-detail { position: fixed; z-index: 30; top: 16px; right: 16px; bottom: 16px; width: min(420px, 40vw);
  display: flex; flex-direction: column; gap: 12px; padding: 22px 22px 18px; box-sizing: border-box;
  overflow-y: auto; color: #2b2118; background: #f4ead6; border-radius: 3px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45); transform: translateX(calc(100% + 32px)); visibility: hidden;
  transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), visibility 0s 0.45s; font: 15px/1.55 Inter, system-ui, sans-serif; }
.wall-detail.is-open { transform: none; visibility: visible; transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1); }
@media (max-width: 767px) {
  .wall-detail { top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 72vh; border-radius: 14px 14px 0 0;
    transform: translateY(105%); }
}
@media (prefers-reduced-motion: reduce) { .wall-detail, .wall-detail.is-open { transition: none; } }
.wall-detail h2 { outline: none; margin: 0; font: 400 34px/1.05 "Instrument Serif", Georgia, serif; color: #1d1712; }
.wall-detail .meta { margin: 0; font: 600 12px/1.4 "JetBrains Mono", ui-monospace, monospace; color: #8a4b2c; letter-spacing: 0.02em; }
.wall-detail p { margin: 0; }
.wall-detail img { display: block; width: 100%; height: auto; border-radius: 2px; background: #d9c9ac; }
.wall-detail .gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.wall-detail .stack { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.wall-detail .stack li { font: 600 12px/1 "JetBrains Mono", ui-monospace, monospace; padding: 6px 8px; border: 1px solid #b69a76; border-radius: 3px; }
.wall-detail .links { display: flex; flex-wrap: wrap; gap: 8px; }
.wall-detail .links a { color: #f4ead6; background: #8f2f26; padding: 9px 14px; border-radius: 3px; text-decoration: none; font-weight: 600; }
.wall-detail .links a:focus-visible, .wall-detail .close:focus-visible { outline: 3px solid #e0a35a; outline-offset: 2px; }
.wall-detail .close { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border: 0; border-radius: 50%;
  background: transparent; color: #2b2118; font: 22px/1 system-ui; cursor: pointer; }
`

const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props)
    node.append(...children)
    return node
}

export function createDetail({ onClose }) {
    const style = el('style', { textContent: CSS })
    document.head.append(style)
    const sheet = el('section', { className: 'wall-detail' })
    sheet.setAttribute('role', 'dialog')
    sheet.setAttribute('aria-labelledby', 'wall-detail-title')
    document.body.append(sheet)
    let isOpen = false

    const close = () => {
        if (!isOpen) return
        isOpen = false
        sheet.classList.remove('is-open')
        onClose()
    }

    // entry: { pin, page, image }. page is the project page or null.
    const open = ({ pin, page, image }) => {
        const body = page?.body?.slice(0, 2) ?? [pin.line]
        const cover = page?.cover ?? image?.cover
        const gallery = (page?.gallery ?? []).filter((shot) => shot.src).slice(0, 3)
        const links = page?.links?.length ? page.links : pin.link ? [{ label: 'Visit', href: pin.link }] : []
        const title = el('h2', { id: 'wall-detail-title', textContent: pin.title, tabIndex: -1 })
        const closeButton = el('button', { className: 'close', type: 'button', textContent: '×' })
        closeButton.setAttribute('aria-label', 'Close')
        closeButton.addEventListener('click', close)
        sheet.replaceChildren(
            closeButton,
            el('p', { className: 'meta', textContent: [pin.year, page?.role].filter(Boolean).join(' / ') }),
            title,
            ...(cover ? [el('img', { src: cover, alt: page?.coverAlt ?? '', decoding: 'async' })] : []),
            ...body.map((text) => el('p', { textContent: text })),
            el('ul', { className: 'stack' }, pin.stack.map((name) => el('li', { textContent: name }))),
            ...(gallery.length ? [el('div', { className: 'gallery' }, gallery.map((shot) => el('img', { src: shot.src, alt: shot.alt, loading: 'lazy' })))] : []),
            el('div', { className: 'links' }, links.map((link) => el('a', { href: link.href, textContent: link.label, target: '_blank', rel: 'noopener' }))),
        )
        sheet.scrollTop = 0
        isOpen = true
        sheet.classList.add('is-open')
        title.focus({ preventScroll: true })
    }

    return { open, close, get isOpen() { return isOpen } }
}
