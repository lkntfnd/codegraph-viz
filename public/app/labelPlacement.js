function overlaps(left, right) {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function overlapArea(left, right) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function placement(anchor, align, x, y, rect) {
  return { anchor, align, x, y, rect };
}

export function labelPlacementCandidates({
  x = 0,
  y = 0,
  radius = 0,
  width = 0,
  fontSize = 13,
  gap = 5,
} = {}) {
  const halfWidth = width / 2;
  const padX = 3;
  const topPad = 1;
  const bottomPad = 3;
  const bottomY = y + radius + gap;
  const topY = y - radius - fontSize - gap;
  const rightX = x + radius + gap;
  const leftX = x - radius - gap;
  const sideY = y - fontSize / 2;

  return [
    placement('bottom', 'center', x, bottomY, {
      left: x - halfWidth - padX,
      right: x + halfWidth + padX,
      top: bottomY - topPad,
      bottom: bottomY + fontSize + bottomPad,
    }),
    placement('right', 'left', rightX, sideY, {
      left: rightX - padX,
      right: rightX + width + padX,
      top: sideY - topPad,
      bottom: sideY + fontSize + bottomPad,
    }),
    placement('top', 'center', x, topY, {
      left: x - halfWidth - padX,
      right: x + halfWidth + padX,
      top: topY - topPad,
      bottom: topY + fontSize + bottomPad,
    }),
    placement('left', 'right', leftX, sideY, {
      left: leftX - width - padX,
      right: leftX + padX,
      top: sideY - topPad,
      bottom: sideY + fontSize + bottomPad,
    }),
  ];
}

export function fitLabelPlacement(candidate, bounds = {}) {
  const width = Math.max(0, Number(bounds.width) || 0);
  const height = Math.max(0, Number(bounds.height) || 0);
  let dx = 0;
  let dy = 0;
  if (candidate.rect.left < 0) dx = -candidate.rect.left;
  else if (candidate.rect.right > width) dx = width - candidate.rect.right;
  if (candidate.rect.top < 0) dy = -candidate.rect.top;
  else if (candidate.rect.bottom > height) dy = height - candidate.rect.bottom;
  return {
    ...candidate,
    x: candidate.x + dx,
    y: candidate.y + dy,
    rect: {
      left: candidate.rect.left + dx,
      right: candidate.rect.right + dx,
      top: candidate.rect.top + dy,
      bottom: candidate.rect.bottom + dy,
    },
  };
}

export function labelCapsuleGeometry(rect = {}) {
  const left = Number.isFinite(Number(rect.left)) ? Number(rect.left) : 0;
  const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left;
  const top = Number.isFinite(Number(rect.top)) ? Number(rect.top) : 0;
  const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top;
  const width = Math.max(0, right - left) + 10;
  const height = Math.max(0, bottom - top) + 6;
  return {
    x: left - 5,
    y: top - 3,
    width,
    height,
    radius: Math.min(5, width / 2, height / 2),
  };
}

export function chooseLabelPlacement(candidates = [], occupied = [], { allowOverlap = false } = {}) {
  const open = candidates.find(({ rect }) => (
    !occupied.some((other) => overlaps(rect, other))
  ));
  if (open || !allowOverlap || !candidates.length) return open || null;
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      overlap: occupied.reduce((sum, rect) => sum + overlapArea(candidate.rect, rect), 0),
    }))
    .sort((left, right) => left.overlap - right.overlap || left.index - right.index)[0]
    .candidate;
}
