export function createLoadingTransaction({
  delay = 120,
  show,
  hide,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  if (typeof show !== 'function' || typeof hide !== 'function') {
    throw new TypeError('Loading transaction requires show and hide callbacks');
  }

  let sequence = 0;
  let timer = null;
  let visible = false;

  function begin(copy) {
    const ticket = ++sequence;
    if (timer != null) cancel(timer);
    timer = null;

    if (visible) {
      show(copy);
    } else {
      timer = schedule(() => {
        if (ticket !== sequence) return;
        timer = null;
        visible = true;
        show(copy);
      }, Math.max(0, Number(delay) || 0));
    }
    return ticket;
  }

  function finish(ticket) {
    if (ticket !== sequence) return false;
    if (timer != null) cancel(timer);
    timer = null;
    if (visible) {
      visible = false;
      hide();
    }
    return true;
  }

  function reset() {
    sequence += 1;
    if (timer != null) cancel(timer);
    timer = null;
    if (visible) {
      visible = false;
      hide();
    }
  }

  return { begin, finish, reset };
}
