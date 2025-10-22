uniform float uTime;
uniform vec3 uColour;
uniform vec3 uMoonColour;
uniform vec3 uMoonDirection;
uniform float uRipple;
uniform float uClearest;
uniform float uMurkiest;

varying vec3 vWorldPosition;

#include <fog_pars_fragment>

// A few travelling sine waves. Only their slope matters, so this returns the
// x and z derivatives of the height.
vec2 slope(vec2 p, float t)
{
    vec2 s = vec2(0.0);
    s += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.21 + t * 0.9) * 0.21;
    s += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 0.37 + t * 1.3) * 0.37 * 0.6;
    s += vec2(0.97, -0.24) * cos(dot(p, vec2(0.97, -0.24)) * 0.83 + t * 1.9) * 0.83 * 0.3;
    s += vec2(-0.2, -0.98) * cos(dot(p, vec2(-0.2, -0.98)) * 1.7 + t * 2.6) * 1.7 * 0.12;
    return s;
}

void main()
{
    vec3 toCamera = cameraPosition - vWorldPosition;
    float distance = length(toCamera);
    vec3 view = toCamera / distance;

    // Ripples flatten out with distance, so the far sea does not shimmer.
    float fade = 1.0 - smoothstep(60.0, 600.0, distance);
    vec2 s = slope(vWorldPosition.xz, uTime) * uRipple * fade;
    vec3 normal = normalize(vec3(-s.x, 1.0, -s.y));

    // Looking straight down you see the lagoon floor, at a grazing angle the
    // sea turns into a mirror of the night sky.
    float facing = clamp(dot(view, normal), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 3.0);
    float alpha = mix(uClearest, uMurkiest, fresnel);

    vec3 colour = uColour * (0.55 + 0.25 * fresnel);

    // The moon glint. A tight hot spot on top of a wider sheen.
    vec3 reflected = reflect(-view, normal);
    float glint = max(dot(reflected, normalize(uMoonDirection)), 0.0);
    colour += uMoonColour * (pow(glint, 400.0) * 2.5 + pow(glint, 40.0) * 0.12);

    gl_FragColor = vec4(colour, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}
