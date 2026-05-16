// Animation-safe SVGO config. The covers are hand-tuned animated SVGs:
// keep <style>/@keyframes, ids/classes, viewBox, group structure. Only
// strip numeric bloat, whitespace, comments, metadata and editor cruft.
module.exports = {
  multipass: true,
  js2svg: { indent: 0, pretty: false },
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
          cleanupIds: false,
          inlineStyles: false,
          minifyStyles: false,
          removeHiddenElems: false,
          collapseGroups: false,
          moveGroupAttrsToElems: false,
          convertShapeToPath: false,
          mergePaths: false,
          removeUselessStrokeAndFill: false,
          removeUnknownsAndDefaults: false,
          convertPathData: { floatPrecision: 2 },
          cleanupNumericValues: { floatPrecision: 2 },
        },
      },
    },
    { name: 'removeAttrs', params: { attrs: 'data-om-id' } },
  ],
};
