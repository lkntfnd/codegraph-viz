export function createCanvasTransition({
  source,
  overlay,
  reducedMotion = () => false,
  scheduleFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  scheduleFallback = setTimeout,
  cancelFallback = clearTimeout,
} = {}) {
  const context = overlay?.getContext?.('2d');
  if (!source || !overlay || !context) {
    throw new TypeError('Canvas transition requires source and overlay canvases');
  }

  let sequence = 0;
  let frame = null;
  let fallback = null;

  function cancelPending() {
    if (frame != null) cancelFrame(frame);
    if (fallback != null) cancelFallback(fallback);
    frame = null;
    fallback = null;
  }

  function clear(ticket = sequence) {
    if (ticket !== sequence) return false;
    cancelPending();
    overlay.hidden = true;
    overlay.classList.remove('is-revealing');
    return true;
  }

  function capture() {
    sequence += 1;
    cancelPending();
    overlay.classList.remove('is-revealing');
    overlay.width = source.width;
    overlay.height = source.height;
    context.clearRect(0, 0, overlay.width, overlay.height);
    context.drawImage(source, 0, 0);
    overlay.hidden = false;
    void overlay.offsetWidth;
    return sequence;
  }

  function reveal(ticket) {
    if (ticket !== sequence) return false;
    if (reducedMotion()) {
      clear(ticket);
      return true;
    }
    frame = scheduleFrame(() => {
      if (ticket !== sequence) return;
      frame = null;
      overlay.classList.add('is-revealing');
      fallback = scheduleFallback(() => clear(ticket), 260);
    });
    return true;
  }

  overlay.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'opacity') clear(sequence);
  });

  return { capture, reveal, clear };
}
