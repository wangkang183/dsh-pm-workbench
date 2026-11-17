# Marketplace submission / 插件市场投稿

Account: `wangkang183` (confirmed). Proposed public repo: `dsh-pm-workbench`.

Target list: <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
Rules: <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md>

The list is data-driven: a submission is **one YAML file** under
`data/plugins/<owner>__<repo>.yml`. Do not edit either README by hand; they are
generated from the YAML files after merge.

## Readiness

| Requirement | Status |
|---|---|
| Public GitHub repo | ❌ not created yet (this directory is local) |
| `dsh.bundle` in `package.json` | ✅ |
| `cordis.patch.yml` next to it | ✅ |
| Real working code | ✅ (Host routes + tools, client UI, tests) |
| Repo at least 1 day old | ❌ after the repo is created |
| `dsh-plugin` topic | ❌ add after creating the repo |
| Description accurate | ✅ draft below, but review against the final repo |
| Category | `ui` (right-sidebar workbench UI) |
| Icon | ✅ `assets/icon-180.png` generated; reference it from the entry if desired |
| `README` self-contained | ✅ plan copied to `docs/PLAN.md` and linked locally |
| `LICENSE` | ✅ MIT (`LICENSE`) |
| `private: true` in package.json | ✅ removed; package name is `dsh-pm-workbench` |

## 1. Create the public repo

The repo root must be this plugin directory (or a subdirectory pointed at by
the entry's `url`). For a monorepo, point `url` at the subdirectory, use
`name: OWNER/REPO#SUBDIR`, and name the file
`OWNER__REPO--path-to-subdir.yml`.

At minimum commit:
```text
package.json          # dsh.bundle + dsh.client
cordis.patch.yml
index.js
client.js
store.js
tools.js
locale/zh.json
locale/en.json
icon.svg
assets/icon-180.png
README.md
docs/PLAN.md
MARKETPLACE.md
submission/wangkang183__dsh-pm-workbench.yml
submission/PR.md
LICENSE
```

Before pushing:

- Copy the plan document into `docs/` and change the README link, or remove the
  external link. A GitHub reader cannot open `../../docs/...`.
- `repair.ps1` has been removed; it contained local profile paths.
- `LICENSE` is included (MIT).
- Optional: add `assets/icon-180.png` and reference it from the list entry.
- Add the GitHub topic **`dsh-plugin`**.

## 2. Add the list entry

The exact draft for this repo is:
[`submission/wangkang183__dsh-pm-workbench.yml`](submission/wangkang183__dsh-pm-workbench.yml).

Copy it to the fork as `data/plugins/wangkang183__dsh-pm-workbench.yml`.

```yaml
url: https://github.com/wangkang183/dsh-pm-workbench
name: wangkang183/dsh-pm-workbench
category: ui
description:
  en: 'A right-sidebar memo workbench with tags, due dates, calendar, AI item parsing, a weekly digest, and host tools for conversational and WeChat todo management.'
  zh: '右侧栏记事本式工作台：标签、截止日期、日历、AI 拆分、周报，以及对话/微信操作待办的 Host 工具。'
icon: https://raw.githubusercontent.com/wangkang183/dsh-pm-workbench/main/assets/icon-180.png
```

Notes:

- `description.en` is required and must end with a period. Quote it because it
  contains `: `.
- `description.zh` is optional; a maintainer can fill it.
- The description must match the code. Do not add numbers or API names unless
  they really exist.
- `icon` is optional; omit it to fall back to the owner avatar. If supplied, it
  must be a GitHub-hosted raster image (PNG/JPEG), not SVG.
- `category` is a best-fit field; maintainers may change it.

## 3. Open the PR

- PR title: `Add OWNER/REPO`
- PR body: one paragraph on what the plugin does and how it was tested.
- Touch only your own YAML file. Do not edit the generated READMEs or other
  entries.
- CI checks the manifest, repo age, YAML formatting, and README regeneration;
  a maintainer then reads the repo.

Useful commands (run where `git` and `gh` are authenticated):

```bash
git init
git add .
git commit -m "Initial commit: DSH PM workbench"
git branch -M main
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
gh repo edit OWNER/REPO --add-topic dsh-plugin
```

Then fork and clone the awesome list, add the YAML, and open the PR.

## 4. Optional install experience

- **npm**: already named `dsh-pm-workbench` and no longer private; `npm publish`
  after logging in.
- **GitHub Release tarball**: build a prebuilt `.tgz` and add an optional
  `tarball:` field to the entry. This is required only if the repo cannot be
  installed from source.

## Current blockers

1. No public GitHub repository / remote exists.
2. The repo must be at least one day old before the PR.
3. Upload the contents of `pm-workbench-release/`, not the live
   `pm-workbench/` directory (the live one keeps the local `@local` package
   name so the current installation keeps working).
