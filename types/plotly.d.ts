/**
 * plotly.js-dist-min ships the same JS as plotly.js but has no type package.
 * Re-export the types from the main @types/plotly.js package so our imports
 * from "plotly.js-dist-min" are typed.
 */
declare module "plotly.js-dist-min" {
  const Plotly: typeof import("plotly.js");
  export default Plotly;
  export * from "plotly.js";
}
