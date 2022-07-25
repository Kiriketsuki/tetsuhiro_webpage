<template>
    <Renderer ref = "renderer" pointer resize = "window" class = "w-screen h-screen">
        <Scene ref = "scene" background = "#000">
            <Group ref = "group" :position = "{ z:10 }">
                <Camera ref = "camera" :position = "{ z:10 }"/>
            </Group>
            <PointLight color = "#ddd" :intensity = "1" :position = "{ y:50, x: 50 }"/>
            <!-- <AmbientLight /> -->
            <TorusKnot ref="box" :rotation="{ y: Math.PI / 4, z: Math.PI / 4 }" :radius = "radius" :tubularSegments = "tubSegs" :radialSegments = "radialSegs" :tube = '0.1'>
                <LambertMaterial />
            </TorusKnot>

            <InstancedMesh ref = 'imesh' :count = "NUM_INSTANCES">
                <SphereGeometry :radius = '0.05'/>
                <PhongMaterial />
            </InstancedMesh>
        </Scene>
    </Renderer>
</template>

<script>
    import { Object3D, MathUtils } from 'three';
    export default {
        data() {
            return {
                radius: 1,
                tubSegs: 10,
                radialSegs: 8,
                NUM_INSTANCES: 10000,
            }
        },
        mounted() {
            // get items via ref
            const renderer = this.$refs.renderer;
            const scene = this.$refs.scene.scene;
            const camera = this.$refs.camera.camera;
            const box = this.$refs.box.mesh;
            const group = this.$refs.group.group;

            // cursor
            const cursorXY = renderer.three.pointer.position; // top left is 0 0
            var wheel_change = 0;

            // change properties
            renderer.three.setSize(window.innerWidth, window.innerHeight);

            // instanced mesh
            const imesh = this.$refs.imesh.mesh;
            const dummy = new Object3D();
            const { randFloat: rnd, randFloatSpread: rndFS } = MathUtils;

            for (var i = 0; i < this.NUM_INSTANCES; i++) {
                dummy.position.set(rndFS(200), rndFS(200), rndFS(200));
                const scale = rnd(0.1, 1);
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();
                imesh.setMatrixAt(i, dummy.matrix);
            }
            imesh.instanceMatrix.needsUpdate = true;
            // render loop
            renderer.onBeforeRender(() => {
                box.rotation.x += 0.01;
                const parallax_X = (cursorXY.x/window.innerWidth) - 0.5;
                const parallax_Y = (cursorXY.y/window.innerHeight) - 0.5;

                camera.position.x = parallax_X * 1;
                camera.position.y = - parallax_Y * 1;
                camera.position.x += wheel_change;
            });


            window.addEventListener('wheel', (e) => {
                e.preventDefault();
                wheel_change += e.deltaY * 0.01;
            })


        }
    }
</script>