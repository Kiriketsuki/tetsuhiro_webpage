import { shallowRef } from 'vue'

// The props on the home walk that open a page. src/three.js sets this to the controls of
// scene/aerie/props.js once the aerie is in, and Home shows the prop labels from then on.
const controls = shallowRef(null)

export function useProps() {
    return { controls }
}
