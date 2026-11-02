# Inside a MacBook Pro

Take apart a 2012 15-inch MacBook Pro with Retina display in 3D.

Open `index.html` in a browser.

![Assembled](screenshots/assembled.jpg)
![Inside](screenshots/inside.jpg)
![Taken apart](screenshots/apart.jpg)

- Drag to rotate, scroll to zoom
- Double-click the case to turn it over
- Double-click a part, then drag it out

Build: `npm install && npm run build`

## Live site

https://em0v0.github.io/InsideAMacBookPro/

Use the top switcher to open either teardown. Switching loads the other page and resets the current assembly.

GitHub Pages publishes automatically from `main` / root. After changing source files, run `npm run build` and commit the generated `index.html`. The switcher is maintained in `src/template.html`.
