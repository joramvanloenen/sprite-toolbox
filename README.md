# Sprite Toolbox

A local-first sprite extraction and atlas editor. No install, account or image upload. Open [Sprite Toolbox](https://joramvanloenen.github.io/sprite-toolbox/).

## Extract a sprite sheet

1. Choose **Extract an atlas**, or drop a sheet onto the page.
2. The dominant border color is selected automatically. Use **Pick color** to sample a different background.
3. Adjust tolerance, edge softness and defringe while watching the cleaned preview. Defringe estimates the foreground color behind the background matte, reducing colored halos around antialiased edges.
4. Automatic objects are isolated using connected components. **Join nearby parts** groups small detached details; **Minimum object** suppresses debris. Select **Source grid** for animation sheets or sprites with disconnected pieces in fixed cells.
5. **Add sprites to atlas** adds the cleaned cutouts to the collection.

Already transparent sheets preserve their alpha by default. **Protect enclosed matching colors** only removes matching background reachable from the image edges or existing transparency, useful for white highlights inside a sprite.

## Arrange sprites

- Add multiple transparent PNGs with **Add PNG sprites**. Empty borders are trimmed and original alpha is preserved.
- The output is always square and power of two: 256, 512, **1024 (default)**, 2048 or 4096 pixels.
- Choose rows, columns and cell padding. Grid capacity expands when importing more sprites than fit. Uneven cell divisions use exact integer boundaries without gaps.
- Select a sprite and drag it inside its grid cell. Drag the lower-right handle to scale, or use the numeric inspector. Arrow keys nudge by one pixel; Shift + arrow keys nudge by ten.
- 100% scale fits the complete sprite inside the padded cell. Larger scales and offsets can clip the sprite; the inspector warns when this happens. Drawing is clipped to the padded cell, so sprites never bleed into adjacent cells.
- Drag collection tiles to reorder, drop them onto a preview cell, or use **Move to slot** (also works on touchscreens). Occupied slots swap their contents.
- **Pixel art** enables nearest-neighbor sampling; the default uses smooth scaling. Preview backgrounds cycle through checkerboard, light and dark. Guides never appear in exported files.

## Export

- **Export PNG** saves a transparent RGBA sheet. **Color bleed** extends RGB into fully transparent pixels while retaining zero alpha to reduce dark seams with texture filtering. A direct PNG encoder retains these hidden RGB values, which browser canvas PNG export normally discards. Bleed never crosses a grid-cell boundary.
- **Export frame data** saves a JSON hash with full-cell frame rectangles, source sizes, center pivots, sprite transforms and visible content rectangles. Frame rectangles use pixels from the atlas top-left. Duplicate names receive unique suffixes in JSON.
- **Save sprite** exports the selected original cleaned cutout, before its atlas transform.

## Foliage lab

The dedicated **Foliage** tab creates transparent, game-style assets using deterministic shape rules. Choose a broadleaf tree, conifer or shrub; the seed controls the arrangement and gives reproducible variants. Tune canopy width and height, leaf density, leaf size, trunk thickness, leaf and trunk colors, light direction, volume contrast and painterly texture. Four editable palettes cover woodland, evergreen and autumn colors.

The canopy is built entirely from individual leaves growing in pairs along short twigs. Broadleaf sprites have pointed, serrated blades, folded shading, fine veins and painterly pigment strokes; conifers use narrow needles. No filled shapes sit behind the leaves. Gaps remain transparent and irregular leaf silhouettes form the canopy edge. Invisible cluster volumes provide spherical lighting, while the whole canopy also has directional volume lighting. Lower leaf density opens up the foliage; leaf size controls the blades independently of texture. The trunk and branches use tapered silhouettes, directional shading and bark strokes.

**Add to atlas** inserts a trimmed copy into a new cell. **Export foliage PNG** saves the complete 256, 512 or 1024 pixel sprite on transparency, with two pixels of transparent RGB bleed. Preview backgrounds are excluded. A new seed changes the tree, while other controls keep its shape stable.

## Limits

Color keying works best with a flat background that differs from the subject. A foreground color identical to its surrounding background cannot be recovered uniquely. Tolerance and defringe are adjustable; fine translucent materials may need manual tuning. Touching objects form one connected component; use source-grid detection if the source layout is known. Inputs are limited to 16 megapixels, 8192 pixels per side, and 1024 sprites per sheet. Work is held in memory; export before closing or refreshing the page.

## Development and deployment

Plain HTML, CSS and ES modules. Pixel processing runs in a Web Worker. No build step or third-party runtime dependencies.

```sh
python3 -m http.server 8080
node --test tests/*.test.js
```

GitHub Pages serves the repository root from `main`. `.nojekyll` preserves the static files as written. The app requires a modern browser with Canvas, Web Workers, `createImageBitmap` and `CompressionStream`.
