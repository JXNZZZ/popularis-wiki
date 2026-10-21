# Popularis Map

The 3D BlueMap of the Popularis world, set up to run on GitHub Pages
(no Java server needed). The wiki's Locations page shows it in a frame,
and it's also at <site>/map/ on its own.

THIS FOLDER IS GENERATED - don't edit it by hand. To update the map:
1. Re-render in MAP-RENDER:  java -jar bluemap-cli.jar -r
2. In the wiki folder run:   node tools/export-map.mjs
3. Commit and push.
