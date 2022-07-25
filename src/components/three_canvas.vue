<template>
    <Renderer ref = "renderer" shadow pointer alpha resize = "window" class = "w-screen h-screen">
        <Scene ref = "scene" fog background = "#06101d">
            <Group ref = "group" :position = "{ z:10 }">
                <Camera ref = "camera" :position = "{ x: 40, y:3, z:-40}"/>
            </Group>
            <PointLight color = "#fff" :intensity = "0.2"  cast-shadow :position = "{ y:50, x: 40, z: 40 }"/>
            <Box :position = "{y:50 ,x :40 , z:40}"/>
            <AmbientLight cast-shadow :intensity="1.3"/>
            <!-- <TorusKnot ref="box" :rotation="{ y: Math.PI / 4, z: Math.PI / 4 }" :radius = "radius" :tubularSegments = "tubSegs" :radialSegments = "radialSegs" :tube = '0.1'>
                <LambertMaterial />
            </TorusKnot> -->

            <GltfModel cast-shadow receive-shadow src="../models/lake_mountain.glb" @load="onReady"/>

            <InstancedMesh ref = 'imesh' :count = "NUM_INSTANCES">
                <SphereGeometry :radius = '0.05'/>
                <PhongMaterial />
            </InstancedMesh>
        </Scene>
    </Renderer>
</template>

<script>
    import { Object3D, MathUtils } from 'three';
    import * as THREE from 'three';
    import { gsap } from 'gsap';
    export default {
        data() {
            return {
                radius: 3,
                tubSegs: 512,
                radialSegs: 128,
                NUM_INSTANCES: 1000,
                scroll_min: 0,
                background: {
                    r: 255/255,
                    g: 255/255,
                    b: 255/255
                }
            }
        },
        mounted() {
            // get items via ref
            const renderer = this.$refs.renderer;
            const scene = this.$refs.scene.scene;
            const camera = this.$refs.camera.camera;
            // const box = this.$refs.box.mesh;
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
                dummy.position.set(rndFS(100), rndFS(100), rndFS(100));
                const scale = rnd(0.1, 1);
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();
                imesh.setMatrixAt(i, dummy.matrix);
            }
            imesh.instanceMatrix.needsUpdate = true;
            // render loop
            var prev_x = window.innerWidth / 2;
            var prev_y = window.innerHeight / 2;

            const fog = new THREE.Fog(0x06101d, 1, 100);
            scene.fog = fog;
            renderer.onBeforeRender(() => {
                // scene.background = this.background
                // console.log(scene)
                // box.rotation.x += 0.001;
                var parallax_X = (cursorXY.x - prev_x) * 0.001;
                var parallax_Y = (cursorXY.y - prev_y) * 0.001;
                prev_x = cursorXY.x;
                prev_y = cursorXY.y;
                
                if (wheel.changed) {
                    // console.log("triggered")
                    gsap.fromTo(camera.position, {x: camera.position.x }, {x: camera.position.x + wheel.value * 5.5, duration: 0.5});
                    wheel.changed = false;
                    wheel.value = 0;
                }

                camera.position.x += parallax_X;
                camera.position.y -= parallax_Y;
                camera.lookAt(0, 3, camera.position.z + 1000);
                // camera.position.x -= 0.1
            });


            window.addEventListener('wheel', (e) => {
                wheel.changed = true;
                e.deltaY > 0 ? wheel.value -= 1 : wheel.value += 1;
            })
        },
        methods : {
            onReady(model){
                console.log(model)
                model.scene.traverse(o => {
                    if (o.isMesh){
                        // handle both multiple and single materials
                        const asArray = Array.isArray(o.material) ? o.material : [o.material]
                        // 0 works for matte materials - change as needed
                        // asArray.forEach(mat => mat.metalness = 0.5)
                    }
                })
            }
        }
    }
</script>