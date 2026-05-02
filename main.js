import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 1000);
camera.position.set(0, 40, 70);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(canvas.width, canvas.height);
renderer.setClearColor(0x000000);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;

let isLangEN = false;

const i18n = {
    title: '三体',
    subtitle: 'THE THREE-BODY PROBLEM',
    controls: '控制面板',
    reset: '重置',
    play: '开始',
    apply: '应用',
    pause: '暂停',
    speed: '模拟速度',
    trail: '拖尾',
    path: '轨迹',
    random: '随机',
    mass: '质量参数',
    position: '初始坐标',
    velocity: '初始速度',
    energy: '能量漂移',
    d12: 'd12',
    d23: 'd23',
    d31: 'd31',
    aiBadge: '⚠️ AI 生成'
};

const i18nEn = {
    title: 'Three-Body',
    subtitle: 'THE THREE-BODY PROBLEM',
    controls: 'CONTROLS',
    reset: 'Reset',
    play: 'Play',
    apply: 'Apply',
    pause: 'Pause',
    speed: 'Speed',
    trail: 'Trail',
    path: 'Path',
    random: 'Random',
    mass: 'Mass',
    position: 'Position',
    velocity: 'Velocity',
    energy: 'Energy Drift',
    d12: 'd12',
    d23: 'd23',
    d31: 'd31',
    aiBadge: '⚠️ AI Generated'
};

function toggleLang() {
    isLangEN = !isLangEN;
    const dict = isLangEN ? i18nEn : i18n;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
    });

    document.getElementById('langToggle').textContent = isLangEN ? '中' : 'EN';

    if (!isPlaying) {
        document.getElementById('playPauseBtn').textContent = isLangEN ? 'Play' : '播放';
    } else {
        document.getElementById('playPauseBtn').textContent = isLangEN ? 'Pause' : '暂停';
    }
}

const G = 200;
const dt = 0.001;
const softening = 1;

let isPlaying = false;
let speed = 1;
let showTrail = true;
let showPath = true;

const colors = [0x70c0d0, 0xd070a0, 0xd0b070];
const bodies = [];
let initialEnergy = 0;

const trailLen = 50;
const pathLen = 80;

function initScene() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
        const r = 80 + Math.random() * 150;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x555555, size: 0.3 })));
}

function createBody(pos, color) {
    const group = new THREE.Group();

    const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 16, 16),
        new THREE.MeshBasicMaterial({ color })
    );
    group.add(core);

    const glow = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 16, 16),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
    );
    group.add(glow);

    group.add(new THREE.PointLight(color, 0.6, 18));
    group.position.copy(pos);
    scene.add(group);

    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(trailLen * 3);
    for (let i = 0; i < trailLen; i++) {
        trailPos[i * 3] = pos.x;
        trailPos[i * 3 + 1] = pos.y;
        trailPos[i * 3 + 2] = pos.z;
    }
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
    const trail = new THREE.Line(trailGeo, trailMat);
    scene.add(trail);

    const pathGeo = new THREE.BufferGeometry();
    const pathPos = new Float32Array(pathLen * 3);
    for (let i = 0; i < pathLen; i++) {
        pathPos[i * 3] = pos.x;
        pathPos[i * 3 + 1] = pos.y;
        pathPos[i * 3 + 2] = pos.z;
    }
    pathGeo.setAttribute('position', new THREE.BufferAttribute(pathPos, 3));
    const pathMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 });
    const path = new THREE.Line(pathGeo, pathMat);
    scene.add(path);

    return { mesh: group, trail, path, trailArr: [], pathArr: [] };
}

function parseCoord(str, fallback) {
    if (!str || !str.trim()) return fallback;
    const parts = str.trim().split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every(n => !isNaN(n))) {
        return new THREE.Vector3(parts[0], parts[1], parts[2]);
    }
    return fallback;
}

function randomIC() {
    const pos = [], vel = [];
    for (let i = 0; i < 3; i++) {
        let p;
        let attempts = 0;
        do {
            p = new THREE.Vector3(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 5
            );
            attempts++;
        } while (pos.some(existing => p.distanceTo(existing) < 5) && attempts < 20);
        pos.push(p);
        const speed = 0.3 + Math.random() * 0.8;
        const angle = Math.random() * Math.PI * 2;
        vel.push(new THREE.Vector3(
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            (Math.random() - 0.5) * 0.2
        ));
    }
    let comP = new THREE.Vector3(), comV = new THREE.Vector3();
    pos.forEach(p => comP.add(p));
    vel.forEach(v => comV.add(v));
    comP.divideScalar(3);
    comV.divideScalar(3);
    pos.forEach(p => p.sub(comP));
    vel.forEach(v => v.sub(comV));
    return { pos, vel };
}

function getCustomIC() {
    const pos1 = parseCoord(document.getElementById('pos1').value, null);
    const pos2 = parseCoord(document.getElementById('pos2').value, null);
    const pos3 = parseCoord(document.getElementById('pos3').value, null);

    const vel1 = parseCoord(document.getElementById('vel1').value, null);
    const vel2 = parseCoord(document.getElementById('vel2').value, null);
    const vel3 = parseCoord(document.getElementById('vel3').value, null);

    return { pos: [pos1, pos2, pos3], vel: [vel1, vel2, vel3] };
}

function accel(pos, masses) {
    const a = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (i === j) continue;
            const d = new THREE.Vector3().subVectors(pos[j], pos[i]);
            const dist = d.length();
            const r2 = dist * dist + softening * softening;
            a[i].add(d.normalize().multiplyScalar(G * masses[j] / r2));
        }
    }
    return a;
}

function step() {
    const pos = bodies.map(b => b.mesh.position.clone());
    const vel = bodies.map(b => b.velocity.clone());
    const masses = bodies.map(b => b.mass);

    const k1v = accel(pos, masses);
    const k1p = vel.map(v => v.clone());

    const pos2 = pos.map((p, i) => p.clone().add(k1p[i].clone().multiplyScalar(dt * 0.5)));
    const vel2 = vel.map((v, i) => v.clone().add(k1v[i].clone().multiplyScalar(dt * 0.5)));
    const k2v = accel(pos2, masses);
    const k2p = vel2;

    const pos3 = pos.map((p, i) => p.clone().add(k2p[i].clone().multiplyScalar(dt * 0.5)));
    const vel3 = vel.map((v, i) => v.clone().add(k2v[i].clone().multiplyScalar(dt * 0.5)));
    const k3v = accel(pos3, masses);
    const k3p = vel3;

    const pos4 = pos.map((p, i) => p.clone().add(k3p[i].clone().multiplyScalar(dt)));
    const vel4 = vel.map((v, i) => v.clone().add(k3v[i].clone().multiplyScalar(dt)));
    const k4v = accel(pos4, masses);
    const k4p = vel4;

    for (let i = 0; i < 3; i++) {
        const dv = k1v[i].clone().add(k2v[i].clone().multiplyScalar(2)).add(k3v[i].clone().multiplyScalar(2)).add(k4v[i]).multiplyScalar(dt / 6);
        const dp = k1p[i].clone().add(k2p[i].clone().multiplyScalar(2)).add(k3p[i].clone().multiplyScalar(2)).add(k4p[i]).multiplyScalar(dt / 6);
        bodies[i].velocity.add(dv);
        bodies[i].mesh.position.add(dp);
    }
}

function updateTrails() {
    bodies.forEach(b => {
        const p = b.mesh.position;

        b.trailArr.unshift(p.clone());
        if (b.trailArr.length > trailLen) b.trailArr.pop();
        const tArr = b.trail.geometry.attributes.position.array;
        for (let i = 0; i < b.trailArr.length; i++) {
            tArr[i * 3] = b.trailArr[i].x;
            tArr[i * 3 + 1] = b.trailArr[i].y;
            tArr[i * 3 + 2] = b.trailArr[i].z;
        }
        b.trail.geometry.attributes.position.needsUpdate = true;
        b.trail.geometry.setDrawRange(0, b.trailArr.length);
        b.trail.visible = showTrail;

        b.pathArr.unshift(p.clone());
        if (b.pathArr.length > pathLen) b.pathArr.pop();
        const pArr = b.path.geometry.attributes.position.array;
        for (let i = 0; i < b.pathArr.length; i++) {
            pArr[i * 3] = b.pathArr[i].x;
            pArr[i * 3 + 1] = b.pathArr[i].y;
            pArr[i * 3 + 2] = b.pathArr[i].z;
        }
        b.path.geometry.attributes.position.needsUpdate = true;
        b.path.geometry.setDrawRange(0, b.pathArr.length);
        b.path.visible = showPath;
    });
}

function energy() {
    let ke = 0, pe = 0;
    bodies.forEach(b => ke += 0.5 * b.mass * b.velocity.lengthSq());
    for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
            const d = bodies[i].mesh.position.distanceTo(bodies[j].mesh.position);
            pe -= G * bodies[i].mass * bodies[j].mass / (d + 0.01);
        }
    }
    return ke + pe;
}

function init() {
    bodies.forEach(b => {
        scene.remove(b.mesh);
        scene.remove(b.trail);
        scene.remove(b.path);
    });
    bodies.length = 0;

    const useRandom = document.getElementById('randomToggle').checked;
    const ic = useRandom ? randomIC() : getCustomIC();

    const masses = [
        parseFloat(document.getElementById('mass1').value) || 1,
        parseFloat(document.getElementById('mass2').value) || 1,
        parseFloat(document.getElementById('mass3').value) || 1
    ];

    for (let i = 0; i < 3; i++) {
        const body = createBody(ic.pos[i], colors[i]);
        body.velocity = ic.vel[i].clone();
        body.mass = masses[i];
        body.trailArr = [];
        body.pathArr = [];
        bodies.push(body);
    }

    initialEnergy = energy();
    updateDrift();
    document.getElementById('dist12').textContent = '--';
    document.getElementById('dist23').textContent = '--';
    document.getElementById('dist31').textContent = '--';
}

function updateDrift() {
    if (!initialEnergy) return;
    const drift = Math.abs((energy() - initialEnergy) / initialEnergy) * 100;
    const el = document.getElementById('energyDrift');
    el.textContent = drift.toFixed(2);
    el.style.color = drift < 1 ? '#4f4' : drift < 5 ? '#ff4' : '#f44';
}

function updateDistances() {
    if (bodies.length < 3) return;
    const d12 = bodies[0].mesh.position.distanceTo(bodies[1].mesh.position);
    const d23 = bodies[1].mesh.position.distanceTo(bodies[2].mesh.position);
    const d31 = bodies[2].mesh.position.distanceTo(bodies[0].mesh.position);

    document.getElementById('dist12').textContent = d12.toFixed(2);
    document.getElementById('dist23').textContent = d23.toFixed(2);
    document.getElementById('dist31').textContent = d31.toFixed(2);
}

function tick() {
    if (isPlaying) {
        for (let s = 0; s < speed; s++) step();
        updateTrails();
        updateDrift();
        updateDistances();
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}

document.getElementById('resetBtn').onclick = () => {
    init();
    isPlaying = false;
    const playText = isLangEN ? 'Play' : '播放';
    document.getElementById('playPauseBtn').textContent = playText;
};

document.getElementById('applyBtn').onclick = () => {
    const wasPlaying = isPlaying;
    if (isPlaying) {
        isPlaying = false;
    }
    init();
    isPlaying = wasPlaying;
    if (wasPlaying) {
        document.getElementById('playPauseBtn').textContent = '暂停';
    }
};

document.getElementById('playPauseBtn').onclick = () => {
    isPlaying = !isPlaying;
    document.getElementById('playPauseBtn').textContent = isPlaying ? '暂停' : '播放';
};

document.getElementById('speedSlider').oninput = (e) => {
    speed = parseInt(e.target.value);
    document.getElementById('speedValue').textContent = speed + 'x';
};

document.getElementById('trailToggle').onchange = (e) => showTrail = e.target.checked;
document.getElementById('pathToggle').onchange = (e) => showPath = e.target.checked;
document.getElementById('randomToggle').onchange = () => init();

document.getElementById('togglePanel').onclick = () => {
    document.getElementById('controls').classList.toggle('panel-open');
};

document.getElementById('langToggle').onclick = toggleLang;

document.getElementById('screenshotBtn').onclick = () => {
    renderer.render(scene, camera);
    const link = document.createElement('a');
    link.download = `three-body-${Date.now()}.png`;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
};

controls.addEventListener('start', () => {
    canvas.classList.add('dragging');
});

controls.addEventListener('end', () => {
    canvas.classList.remove('dragging');
});

window.onresize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.aspect = canvas.width / canvas.height;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.width, canvas.height);
};

initScene();
init();
tick();