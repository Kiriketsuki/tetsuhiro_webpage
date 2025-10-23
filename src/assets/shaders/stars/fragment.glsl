varying vec3 vColor;
varying float vAlpha;

void main()
{
    float strength = distance(gl_PointCoord, vec2(0.5));
    // strength *= 2.0 ;
    strength = 1.0 - strength;
    strength = pow(strength, 10.0);

    // Fade by alpha instead of mixing towards the old sky colour, which showed up
    // as dark squares once the frame went through tone mapping.
    gl_FragColor = vec4(vColor, strength * vAlpha);
}