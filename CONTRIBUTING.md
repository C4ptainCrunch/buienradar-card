# Contributing

This is a personal project made for my own use. It is not supported in any way — no issues, no PRs, no guarantees it works, no promises it won't set your computer on fire. Use at your own risk. If it breaks, you get to keep both pieces.


## Version Scheme

This project uses [CalVer](https://calver.org/) with the format `YYYY.MM.patch`:

- `YYYY` - Full year (e.g., 2026)
- `MM` - Month (01-12)
- `patch` - Incremental release number within the month, starting at 1

## Releasing a New Version

1. **Commit your changes**

2. **Determine the version number**
   - Check the latest tag: `git tag --sort=-version:refname | head -1`
   - If same month: increment the patch number
   - If new month: use `YYYY.MM.1`

3. **Create and push the tag**
   ```bash
   git tag v20XX.YY.Z
   git push origin main --tags
   ```

4. **Create a GitHub release**
   ```bash
   gh release create v20XX.YY.Z --title "v20XX.YY.Z" --notes "Release notes here"
   ```
