# Release Command

This command creates a git tag with a version bump and description of changes.

## Usage

```
/release [major|minor|patch] [description]
```

Examples:

- `/release minor "✨ Added inventory drag and drop functionality"`
- `/release patch "🐛 Fixed bug with item selection"`
- `/release major "💥 Breaking: Refactored API endpoints"`
- `/release minor "Version 0.20.0: Added new features and improvements"`

## Steps to Execute

### 1. Parse Version Type and Description

- Extract the version type from the command: `major`, `minor`, or `patch`
- Extract the description (rest of the command, if provided)
- If no version type provided or invalid, show usage and exit
- Description is optional - if not provided, will auto-generate from commits

### 2. Generate Changelog from Commits

- Find the last git tag (version tag):
  ```bash
  git describe --tags --abbrev=0
  ```
- If no previous tag exists, use the initial commit or handle gracefully
- Get all commits between the last tag and HEAD:
  ```bash
  git log <last-tag>..HEAD --pretty=format:"%h %s" --no-merges
  ```
- Parse commit messages and generate a changelog description:
  - Group commits by type (feature, fix, improvement, etc.) based on commit message patterns
  - Use emojis to categorize changes (see Emoji Usage section)
  - Format as a multi-line changelog with categorized entries
  - If user provided a description, prepend it to the auto-generated changelog
  - If no commits found, use a default message or prompt user

### 3. Read Current Version

- Read `apps/electron/package.json` to get the current version (e.g., "0.1.0")
- Parse the version into major, minor, and patch components
- Calculate the new version based on the type:
  - **major**: `${major + 1}.0.0` (e.g., 0.1.0 → 1.0.0)
  - **minor**: `${major}.${minor + 1}.0` (e.g., 0.1.0 → 0.2.0)
  - **patch**: `${major}.${minor}.${patch + 1}` (e.g., 0.1.0 → 0.1.1)

### 4. Create Git Tag

- Create an annotated git tag with the new version and description:
  ```bash
  git tag -a v<new-version> -m "<description>"
  ```
- Example: `git tag -a v0.2.0 -m "✨ Added inventory drag and drop functionality"`

### 5. Push Tag to Remote

- Push the tag to remote:
  ```bash
  git push origin v<new-version>
  ```

## Emoji Usage

You can use emojis in release notes to categorize changes:

- ✨ **New features** - New functionality, features, additions
- 🐛 **Bug fixes** - Bug fixes and error corrections
- 🔧 **Improvements** - Refactoring, optimizations, code quality
- ⚡ **Performance** - Performance improvements
- 💥 **Breaking changes** - Breaking API changes, major refactors
- 🎨 **UI/UX** - Visual and user experience updates
- ⚙️ **Configuration** - Config and environment changes
- 📝 **Documentation** - Documentation updates
- 🏗️ **Infrastructure** - Build, deployment, infrastructure
- 🎵 **Audio** - Sound effects, music, audio changes

## Changelog Generation

The release command automatically generates a changelog by analyzing commits between the last tag and HEAD:

1. **Find Last Tag**: Uses `git describe --tags --abbrev=0` to find the most recent version tag
2. **Get Commits**: Retrieves all commits between the last tag and HEAD using `git log <last-tag>..HEAD`
3. **Parse and Categorize**: Analyzes commit messages to categorize changes:
   - Looks for conventional commit patterns (feat:, fix:, refactor:, etc.)
   - Detects emoji prefixes in commit messages
   - Groups similar changes together
4. **Generate Description**: Creates a formatted changelog with:
   - User-provided description (if any) at the top
   - Categorized list of changes with appropriate emojis
   - Commit hash references for traceability

### Example Generated Changelog

```
✨ Added inventory drag and drop functionality

Changes since v0.1.0:

✨ Features:
- Add drag and drop support for inventory items (abc1234)
- Implement new sidebar navigation (def5678)

🐛 Bug Fixes:
- Fix item selection bug in list view (ghi9012)
- Resolve memory leak in component cleanup (jkl3456)

🔧 Improvements:
- Refactor API endpoint structure (mno7890)
- Optimize database queries (pqr2345)
```

## Notes

- The tag message should describe what changed in this release
- Use descriptive messages with emojis to categorize changes
- Tags follow semantic versioning (e.g., v0.1.0, v0.2.0, v1.0.0)
- Version is automatically calculated based on the type specified
- If no previous tag exists, all commits from the repository start will be included
- User-provided description (if any) will be prepended to the auto-generated changelog
