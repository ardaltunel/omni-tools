The home catalog is real HTML so its cards, category filters, and sorted sidebar
are available before JavaScript or remote libraries finish loading.

Edit tool registrations in `#tool-nav` in `index.html`. Category metadata and
inline symbols live in `appHomeCategories` and `appHomeCategoryIcons` in
`index.js`. Existing `legacyToolRoutes` also supply the early route hint. Then
regenerate the marked catalog regions:

```sh
node scripts/generate-catalog.cjs
node scripts/generate-catalog.cjs --check
node --test scripts/catalog.test.cjs
```

The generator sorts the canonical navigation in Turkish order, updates the home
counts, and writes the cards, filters, and route hint from that data. It evaluates
only those three named data literals, never the application boot code, and
requires no packages. `--check` exits with an error if the committed catalog is
stale. The runtime binds the existing cards and filters without replacing them.

Ambiyans Ekranı keeps the internal `ambient-display` tool ID and asset directory.
Its preferred route follows the Turkish catalog name (`ambiyans-ekrani`); the
previous `ambient-display` route continues to resolve to the same tool.
