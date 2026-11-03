// Ends the current task, so the browser can paint the loading screen and handle input between
// the long steps of the aerie build. scheduler.yield resumes ahead of other queued tasks. A
// MessageChannel message stands in where it is missing. A hidden tab throttles neither of
// them the way it throttles setTimeout.
export function nextTask() {
    if (globalThis.scheduler?.yield) return globalThis.scheduler.yield()
    return new Promise((resolve) => {
        const { port1, port2 } = new MessageChannel()
        port1.onmessage = () => {
            port1.close()
            resolve()
        }
        port2.postMessage(null)
    })
}
