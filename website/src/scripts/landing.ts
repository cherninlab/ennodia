// A link to a question, such as /#tokens, opens its answer.
const openFromHash = () => {
  const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  if (target instanceof HTMLDetailsElement) target.open = true;
};
openFromHash();
window.addEventListener("hashchange", openFromHash);
