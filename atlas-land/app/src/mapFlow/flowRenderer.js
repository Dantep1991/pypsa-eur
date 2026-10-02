// Portable Lola/Atlas Leaflet flow renderer. Callers supply validated, oriented
// geometry and physical magnitudes; this module never infers model data.
export function mountFlowRenderer({ map, lines, animated = true, selectedId = '', maximum }) {
  if (!lines?.length) return undefined;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;left:0;top:0;z-index:450;pointer-events:none;';
  canvas.setAttribute('aria-hidden', 'true');
  // Share Leaflet's pane stack so tooltip/pop-up panes stay above the arrows.
  // A canvas appended to the outer map container covers the entire map pane,
  // including its tooltips, regardless of their internal z-index.
  map.getPanes().overlayPane.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return undefined; }
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const theme = getComputedStyle(map.getContainer());
  const arrowInk = theme.getPropertyValue('--atlas-map-text').trim() || 'CanvasText';
  const arrowOutline = theme.getPropertyValue('--atlas-map-surface-solid').trim() || 'Canvas';
  const scale = maximum || Math.max(...lines.map(line => line.magnitude), 1);
  let animation = null, stopped = false, dirty = true, elapsed = 0, previous = null, dpr = 1, projected = [];
  function project() {
    const size = map.getSize();
    const origin = map.containerPointToLayerPoint([0, 0]);
    canvas.style.left = `${origin.x}px`; canvas.style.top = `${origin.y}px`;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(size.x * dpr), height = Math.round(size.y * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      canvas.style.width = `${size.x}px`; canvas.style.height = `${size.y}px`;
    }
    projected = lines.flatMap(line => {
      if (!(line.magnitude > 0) || line.coordinates?.length < 2) return [];
      const points = line.coordinates.map(([lon, lat]) => map.latLngToContainerPoint([lat, lon]));
      let distance = 0;
      const cumulative = [0];
      for (let i = 1; i < points.length; i++) {
        distance += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        cumulative.push(distance);
      }
      return distance < 4 ? [] : [{ ...line, points, cumulative, distance, ratio: Math.sqrt(line.magnitude / scale) }];
    });
    dirty = false;
  }
  function pointAt(line, distance) {
    const index = line.cumulative.findIndex(value => value >= distance);
    const right = Math.max(1, index < 0 ? line.points.length - 1 : index), left = right - 1;
    const span = line.cumulative[right] - line.cumulative[left];
    const ratio = span > 0 ? (distance - line.cumulative[left]) / span : 0;
    return { x: line.points[left].x + (line.points[right].x - line.points[left].x) * ratio,
      y: line.points[left].y + (line.points[right].y - line.points[left].y) * ratio };
  }
  function draw(timestamp) {
    animation = null;
    if (stopped || document.hidden) { previous = null; return; }
    if (dirty) project();
    elapsed += previous == null ? 0 : Math.min(0.1, (timestamp - previous) / 1000);
    previous = timestamp;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    projected.forEach((line, index) => {
      const distance = (!animated || motion?.matches) ? line.distance * 0.58 : (elapsed * 35 + index * 17) % line.distance;
      const head = pointAt(line, distance);
      const tailDistance = Math.max(0, distance - Math.min(line.distance * 0.22, 50));
      if (distance <= tailDistance) return;
      const tail = pointAt(line, tailDistance);
      const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, line.color);
      ctx.globalAlpha = selectedId && line.id !== selectedId ? 0.65 : 1;
      ctx.strokeStyle = gradient; ctx.lineWidth = Math.max(1, line.ratio * 4) + (line.id === selectedId ? 2 : 0);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y);
      line.points.forEach((point, i) => {
        if (line.cumulative[i] > tailDistance && line.cumulative[i] < distance) ctx.lineTo(point.x, point.y);
      });
      ctx.lineTo(head.x, head.y); ctx.stroke();
      const before = pointAt(line, Math.max(0, distance - 4));
      const angle = Math.atan2(head.y - before.y, head.x - before.x), arrow = 7 + line.ratio * 3;
      ctx.fillStyle = arrowInk; ctx.strokeStyle = arrowOutline; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(head.x, head.y);
      ctx.lineTo(head.x - arrow * Math.cos(angle - 0.5), head.y - arrow * Math.sin(angle - 0.5));
      ctx.lineTo(head.x - arrow * Math.cos(angle + 0.5), head.y - arrow * Math.sin(angle + 0.5));
      ctx.closePath(); ctx.stroke(); ctx.fill();
    });
    if (animated && !motion?.matches && projected.length) animation = requestAnimationFrame(draw);
  }
  function start() { if (!stopped && !document.hidden && animation == null) animation = requestAnimationFrame(draw); }
  const invalidate = () => { dirty = true; start(); };
  const visibility = () => {
    if (animation != null) cancelAnimationFrame(animation);
    animation = null; previous = null; dirty = true; start();
  };
  map.on('move zoom viewreset resize', invalidate);
  document.addEventListener('visibilitychange', visibility);
  motion?.addEventListener?.('change', visibility);
  start();
  return () => {
    stopped = true;
    if (animation != null) cancelAnimationFrame(animation);
    map.off('move zoom viewreset resize', invalidate);
    document.removeEventListener('visibilitychange', visibility);
    motion?.removeEventListener?.('change', visibility);
    canvas.remove();
  };
}
