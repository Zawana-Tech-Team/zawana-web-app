// Original procedural model; no third-party model, branding, or texture assets.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const model = new THREE.Group();
model.name = 'Zawana_Sixteen_Feather_Shuttlecock';
const feather = new THREE.MeshStandardMaterial({ color: '#f8f6ec', roughness: .63, side: THREE.DoubleSide });
const stem = new THREE.MeshStandardMaterial({ color: '#ded8c7', roughness: .74 });
const positions = [], indices = [];
const rows = 18, columns = 4;
for (let row = 0; row <= rows; row++) {
  const t = row / rows;
  const taper = t > .85 ? Math.sqrt(Math.max(.04, 1 - ((t - .85) / .16) ** 2)) : 1;
  for (let column = 0; column <= columns; column++) {
    const u = column / columns * 2 - 1;
    positions.push(u * (.015 + .107 * t ** .8) * taper, -.22 + t * 1.1 - Math.max(0, t - .7) * u * u * .07, .13 + t * .53 + (1 - u * u) * .022);
    if (row < rows && column < columns) { const a = row * (columns + 1) + column, b = a + columns + 1; indices.push(a, b, a + 1, b, b + 1, a + 1); }
  }
}
const vane = new THREE.BufferGeometry();
vane.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
vane.setIndex(indices); vane.computeVertexNormals();
const shaft = new THREE.CylinderGeometry(.005, .003, 1.24, 5);
const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1.1, .53).normalize());
for (let i = 0; i < 16; i++) {
  const group = new THREE.Group(); group.rotation.y = i / 16 * Math.PI * 2;
  group.add(new THREE.Mesh(vane, feather));
  const rachis = new THREE.Mesh(shaft, stem); rachis.position.set(0, .31, .395); rachis.quaternion.copy(quaternion); group.add(rachis);
  // Fine feather veins are geometry, avoiding an external texture download.
  for (let j = 4; j < 17; j += 3) {
    const t = j / 18, width = (.015 + .107 * t ** .8) * .85;
    for (const side of [-1, 1]) {
      const from = new THREE.Vector3(0, -.22 + t * 1.1, .13 + t * .53 + .025);
      const to = new THREE.Vector3(width * side, from.y - .035, from.z - .01);
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(.0015, .001, from.distanceTo(to), 3), stem);
      rib.position.copy(from).add(to).multiplyScalar(.5);
      rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize()); group.add(rib);
    }
  }
  model.add(group);
}
const profile = [[0,-.78],[.085,-.76],[.15,-.68],[.185,-.52],[.18,-.34],[.12,-.22],[0,-.2]].map(([x,y])=>new THREE.Vector2(x,y));
model.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 28), new THREE.MeshStandardMaterial({ color: '#ddceb7', roughness: .91 })));
const binding = new THREE.Mesh(new THREE.CylinderGeometry(.124, .15, .11, 28), new THREE.MeshStandardMaterial({ color: '#171b28', roughness: .6 }));
binding.position.y = -.25; model.add(binding);
for (const height of [-.2, -.09, .06]) {
  const radius = .13 + (height + .22) / 1.1 * .53;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .008, 4, 40), stem);
  ring.rotation.x = Math.PI / 2; ring.position.y = height; model.add(ring);
}
// Merge by material: four draw calls, rather than one for every feather rib.
model.updateMatrixWorld(true);
const byMaterial = new Map();
model.traverse(node => {
  if (!node.isMesh) return;
  const geometries = byMaterial.get(node.material) || [];
  geometries.push(node.geometry.clone().applyMatrix4(node.matrixWorld));
  byMaterial.set(node.material, geometries);
});
const optimized = new THREE.Group(); optimized.name = model.name;
for (const [material, geometries] of byMaterial) {
  optimized.add(new THREE.Mesh(mergeGeometries(geometries), material));
  geometries.forEach(geometry => geometry.dispose());
}
const exporter = new GLTFExporter();
const binary = await exporter.parseAsync(optimized, { binary: true, onlyVisible: true });
await mkdir(new URL('../public/models/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/models/shuttlecock.glb', import.meta.url), Buffer.from(binary));
console.log(`Original shuttlecock GLB: ${Math.round(binary.byteLength / 1024)} KB`);
model.traverse(node => { if (node.isMesh) node.geometry.dispose(); });
