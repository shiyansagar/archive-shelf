export const FONT = '"Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

// The black "archives" tile (like essesi's logo tile), drawn on a canvas.
export function drawStudioTile(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0e0e0d';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#f2f2ef';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(size * 0.1)}px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(size * 0.004).toFixed(1)}px`;
  ctx.fillText('archives', size / 2, size / 2);
  return cv;
}
