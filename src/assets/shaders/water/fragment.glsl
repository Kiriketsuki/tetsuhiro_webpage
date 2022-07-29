uniform vec3 uTroughColour;
uniform vec3 uCrestColour;
uniform float uColourOffset;
uniform float uColourMultiplier;

varying float vElevation;

void main() {
    // gl_FragColor = vec4(0.0, 0.1, 0.5, 1.0);
    float mixStrength = (vElevation + uColourOffset) * uColourMultiplier; 
    vec3 colour = mix(uTroughColour, uCrestColour, mixStrength);
    gl_FragColor = vec4(colour, 1.0);
}