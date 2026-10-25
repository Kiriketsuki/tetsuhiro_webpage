// GPU frame time through EXT_disjoint_timer_query_webgl2. Some browsers hide the
// extension. Then `supported` is false and the lab shows CPU times only.
export function createGpuTimer(gl) {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    if (!ext) return { supported: false, begin() {}, end() {}, poll: () => null }

    const pending = []
    let active = null
    let last = null

    const begin = () => {
        if (active || pending.length > 4) return
        active = gl.createQuery()
        gl.beginQuery(ext.TIME_ELAPSED_EXT, active)
    }
    const end = () => {
        if (!active) return
        gl.endQuery(ext.TIME_ELAPSED_EXT)
        pending.push(active)
        active = null
    }
    // Returns the newest finished time in milliseconds, or the previous one.
    const poll = () => {
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
        while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
            const query = pending.shift()
            if (!disjoint) last = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
            gl.deleteQuery(query)
        }
        return last
    }
    return { supported: true, begin, end, poll }
}
