import { c as chain } from "./utils.mjs";
function mergeRefs(...refs) {
  return chain(refs);
}
export {
  mergeRefs as m
};
