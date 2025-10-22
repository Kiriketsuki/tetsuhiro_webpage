// The sea is one flat plane. The ripples live in the fragment shader as normals,
// so the mesh stays four triangles.
varying vec3 vWorldPosition;

#include <fog_pars_vertex>

void main()
{
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
}
