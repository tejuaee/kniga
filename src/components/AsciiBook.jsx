import { useEffect, useRef } from 'react';

// A slowly turning hardcover book, raycast per character cell and drawn as ASCII
// on a canvas. Decorative only: sits behind the auth pages, ignores pointer events.

const RAMP = " .'`,:;-~=+*o#%";

// Book parts in local space (x: width, spine at -x; y: height; z: thickness).
// kind: 0 = board (cover/spine), 1 = page block
const BOXES = [
  { min: [-0.7, -1.02, 0.15], max: [0.72, 1.02, 0.19], kind: 0, front: true },
  { min: [-0.7, -1.02, -0.19], max: [0.72, 1.02, -0.15], kind: 0 },
  { min: [-0.75, -1.02, -0.19], max: [-0.69, 1.02, 0.19], kind: 0, spine: true },
  { min: [-0.69, -0.99, -0.15], max: [0.69, 0.99, 0.15], kind: 1 },
];

// 5x7 bitmap for the cover title
const GLYPHS = {
  K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
  N: ['X...X', 'XX..X', 'XX..X', 'X.X.X', 'X..XX', 'X..XX', 'X...X'],
  I: ['.XXX.', '..X..', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
  G: ['.XXX.', 'X...X', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXX.'],
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
};
const TITLE = 'KNIGA';
const TITLE_COLS = TITLE.length * 6 - 1;
const T_X0 = -0.47, T_X1 = 0.49, T_Y0 = 0.22;
const T_PX = (T_X1 - T_X0) / TITLE_COLS;
const T_Y1 = T_Y0 + 7 * T_PX;

function titlePixel(x, y) {
  if (x < T_X0 || x >= T_X1 || y < T_Y0 || y >= T_Y1) return false;
  const col = Math.floor((x - T_X0) / T_PX);
  const row = 6 - Math.floor((y - T_Y0) / T_PX);
  const g = Math.floor(col / 6);
  const c = col % 6;
  if (c === 5) return false;
  return GLYPHS[TITLE[g]][row][c] === 'X';
}

// Front cover decoration: inset frame, title, a short rule beneath it.
function coverDetail(x, y) {
  if (titlePixel(x, y)) return 2;
  const fx = Math.min(x - -0.6, 0.62 - x);
  const fy = Math.min(y - -0.92, 0.92 - y);
  if (fx > 0 && fy > 0 && Math.min(fx, fy) < 0.022) return 1;
  if (Math.abs(y - 0.08) < 0.012 && Math.abs(x - 0.01) < 0.22) return 1;
  return 0;
}

function rotation(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Rx(pitch) * Ry(yaw) * Rz(roll), row-major
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  return mul(rx, mul(ry, rz));
}
function mul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

export function AsciiBook({ className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let W = 0, H = 0, cw = 8, chh = 15, cols = 0, rows = 0, fs = 13;
    let raf = 0, last = 0, t = -1.6; // open on a three-quarter view of the cover
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    // Warm palette: leather-brown boards, honey page edges, rust title.
    const colors = { board: '#a8653f', page: '#d4a35f', ink: '#8c3f22' };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fs = W < 640 ? 10 : 12;
      ctx.font = `500 ${fs}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textBaseline = 'top';
      cw = ctx.measureText('M').width || fs * 0.6;
      chh = Math.round(fs * 1.25);
      cols = Math.ceil(W / cw);
      rows = Math.ceil(H / chh);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      const R = rotation(
        t * 0.32 + mouse.x * 0.35,
        -0.32 + 0.07 * Math.sin(t * 0.45) + mouse.y * 0.18,
        0.12 * Math.sin(t * 0.27),
      );
      // Camera at (0,0,D) looking down -z; book spans ~80% of the shorter side.
      const f = Math.min(W, H * 1.15) * 1.7;
      const D = (2 * f) / (Math.min(H, W * 1.1) * 0.88);
      const cx = W * (W < 960 ? 0.5 : 0.74);
      const cy = H * 0.5;
      // Local-space camera origin: o_l = R^T * (0,0,D)
      const ox = R[6] * D, oy = R[7] * D, oz = R[8] * D;
      const L = [-0.45, 0.55, 0.7];
      const ll = Math.hypot(...L);
      L[0] /= ll; L[1] /= ll; L[2] /= ll;

      const buckets = [[], [], []];
      for (let j = 0; j < rows; j++) {
        const py = -((j + 0.5) * chh - cy);
        for (let i = 0; i < cols; i++) {
          const px = (i + 0.5) * cw - cx;
          // world dir (px, py, -f) -> local via R^T
          const wx = px, wy = py, wz = -f;
          const dx = R[0] * wx + R[3] * wy + R[6] * wz;
          const dy = R[1] * wx + R[4] * wy + R[7] * wz;
          const dz = R[2] * wx + R[5] * wy + R[8] * wz;
          let best = Infinity, hb = null, axis = 0, sign = 0;
          for (let b = 0; b < BOXES.length; b++) {
            const box = BOXES[b];
            let tmin = -Infinity, tmax = Infinity, ax = 0, sg = 0;
            const o = [ox, oy, oz], d = [dx, dy, dz];
            let miss = false;
            for (let k = 0; k < 3; k++) {
              if (Math.abs(d[k]) < 1e-9) {
                if (o[k] < box.min[k] || o[k] > box.max[k]) { miss = true; break; }
                continue;
              }
              let t1 = (box.min[k] - o[k]) / d[k];
              let t2 = (box.max[k] - o[k]) / d[k];
              let s = -1;
              if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
              if (t1 > tmin) { tmin = t1; ax = k; sg = s; }
              if (t2 < tmax) tmax = t2;
              if (tmin > tmax) { miss = true; break; }
            }
            if (!miss && tmin > 0 && tmin < best) { best = tmin; hb = box; axis = ax; sign = sg; }
          }
          if (!hb) continue;

          // normal in world = R * n_local (column `axis` of R, scaled by sign)
          const nx = R[axis] * sign, ny = R[3 + axis] * sign, nz = R[6 + axis] * sign;
          const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          const hx = ox + dx * best, hy = oy + dy * best, hz = oz + dz * best;
          let b = 0.1 + 0.62 * diff ** 1.4;
          let bucket = hb.kind;
          if (hb.kind === 0) {
            // faint bookcloth weave, fixed to the surface so it turns with the book
            b *= 0.94 + 0.06 * Math.sin(hx * 9 + hz * 9 + 1.3) * Math.sin(hy * 11);
          }

          if (hb.kind === 1 && axis !== 2) {
            // page edges: fine stripes across the thickness
            const s = (hz + 0.15) * 46;
            b *= s - Math.floor(s) < 0.5 ? 0.6 : 1;
          } else if (hb.front && axis === 2 && sign > 0) {
            const d = coverDetail(hx, hy);
            if (d === 2) { b = 1; bucket = 2; }
            else if (d === 1) b = Math.min(0.95, b + 0.3);
            else b *= 0.8;
          } else if (hb.spine && axis === 0 && sign < 0) {
            const ay = Math.abs(hy);
            if ((ay > 0.78 && ay < 0.82) || (ay > 0.86 && ay < 0.88)) b = Math.min(1, b + 0.35);
          }

          const idx = Math.max(1, Math.min(RAMP.length - 1, Math.round(b * (RAMP.length - 1))));
          buckets[bucket].push(i, j, idx);
        }
      }

      const fills = [colors.board, colors.page, colors.ink];
      for (let k = 0; k < 3; k++) {
        const arr = buckets[k];
        ctx.fillStyle = fills[k];
        for (let n = 0; n < arr.length; n += 3) ctx.fillText(RAMP[arr[n + 2]], arr[n] * cw, arr[n + 1] * chh);
      }
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / 30) return; // ~30fps is plenty for a backdrop
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      draw();
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (!reduce.matches && !document.hidden) raf = requestAnimationFrame(loop);
      else draw();
    };
    const onMove = (e) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    resize();
    start();
    document.fonts?.ready.then(resize);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', start);
    reduce.addEventListener?.('change', start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', start);
      reduce.removeEventListener?.('change', start);
    };
  }, []);

  return <canvas ref={ref} className={`ascii-book ${className}`} aria-hidden="true" />;
}
