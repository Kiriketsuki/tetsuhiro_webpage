uniform float uSize;
uniform float uTime;
attribute float aScale;
varying vec3 vColor;
varying float vAlpha;
void main()
{
    /**
     * Position
     */
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    /**
     * Size
     */
    gl_PointSize = uSize * aScale;
    // gl_PointSize *= (1.0/- viewPosition.z);

    vColor = color;
    vAlpha = sin(uTime * modelPosition.z  * 0.01) * 0.5 + 0.5;
}