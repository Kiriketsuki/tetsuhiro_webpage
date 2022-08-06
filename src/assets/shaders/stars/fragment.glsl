varying vec3 vColor;
varying float vAlpha;

void main()
{
    float strength = distance(gl_PointCoord, vec2(0.5));
    // strength *= 2.0 ;
    strength = 1.0 - strength;
    strength = pow(strength, 10.0);

    vec3 color = mix(vec3(0.0/255.0, 18.0/255.0, 32.0/255.0), vColor, strength);
    gl_FragColor = vec4(color, vAlpha);
}