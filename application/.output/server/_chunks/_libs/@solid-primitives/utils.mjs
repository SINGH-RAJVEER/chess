function chain(callbacks) {
  return (...args) => {
    for (const callback of callbacks)
      callback && callback(...args);
  };
}
export {
  chain as c
};
