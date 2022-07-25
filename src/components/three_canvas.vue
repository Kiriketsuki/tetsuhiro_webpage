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
    import { gsap } from 'gsap';
    export default {
        data() {
            return {
                radius: 3,
                tubSegs: 512,
                radialSegs: 128,
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
            var wheel = {
                changed: false,
                value: 0
            }
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
            var prev_x = window.innerWidth / 2;
            var prev_y = window.innerHeight / 2;

            renderer.onBeforeRender(() => {
                box.rotation.x += 0.01;
                var parallax_X = (cursorXY.x - prev_x) * 0.001;
                var parallax_Y = (cursorXY.y - prev_y) * 0.001;
                prev_x = cursorXY.x;
                prev_y = cursorXY.y;
                
                if (wheel.changed) {
                    console.log("triggered")
                    gsap.fromTo(camera.position, {x: camera.position.x }, {x: camera.position.x + wheel.value * 1.5, duration: 0.5});
                    wheel.changed = false;
                    wheel.value = 0;
                }

                camera.position.x += parallax_X;
                camera.position.y -= parallax_Y;
                // camera.position.x += parallax_X * 1;
                // scene.position.y = (cursorXY.y - window.innerHeight) * 10;
                // scene.position.x = (cursorXY.x - window.innerWidth / 2);
            });


            window.addEventListener('wheel', (e) => {
                wheel.changed = true;
                e.deltaY > 0 ? wheel.value += 1 : wheel.value -= 1;
            })
        }
    }
</script>