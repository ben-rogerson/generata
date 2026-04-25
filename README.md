# generata

Composable multi-agent pipelines on top of the Claude Code CLI. The engine - `@generata/core` - runs every step through the [Claude Code CLI](https://docs.anthropic.com/claude-code) so there is no API key to manage.

## Install (workmate flow)

```bash
npm i -g @generata/core
generata init @generata/coding ~/Projects/my-pipeline
cd ~/Projects/my-pipeline
```

`init` will prompt for required env values, copy the template files, and generate Claude Code slash commands for each workflow.

## Packages

| Package                                                    | Description                                                |
| :--------------------------------------------------------- | :--------------------------------------------------------- |
| [`packages/core`](./packages/core)                         | `@generata/core` - engine + CLI (published to npm)         |
| [`packages/templates/coding`](./packages/templates/coding) | The default coding pipeline template (cloned by `init`)    |

## Develop

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

To try the CLI without building:

```bash
node --import tsx packages/core/src/cli.ts help
```

To scaffold from the local template into a temp dir:

```bash
TMP=$(mktemp -d)
node --import tsx packages/core/src/cli.ts init ./packages/templates/coding "$TMP" --yes --skip-install
```

## Release

We use [Changesets](https://github.com/changesets/changesets). Author a changeset with `pnpm changeset`, merge to `main`, and the release workflow will publish the version PR on merge.

## License

ISC
