Three.js 0.180.0, locally vendored from the official npm package (three).
Upstream: https://github.com/mrdoob/three.js/tree/r180
License: MIT (see LICENSE).
three.module.min.js, three.core.min.js are unmodified package build files.
GLTFLoader.js and BufferGeometryUtils.js have only the bare three import changed to the relative local module path, allowing static/offline hosting without a bundler or CDN.
