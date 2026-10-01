## What this changes

<!-- One or two sentences. Which module, which feature. -->

## How it was checked

<!-- What you ran or clicked. "Not tested" is an acceptable answer if you say why. -->

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `apps/web`

## Release

- [ ] Nothing user-visible changes, **or** the new page is marked `status: "development"` in its nav file, **or** it is meant to be live as soon as this merges

## Database

- [ ] No migration, **or**:
  - [ ] it only adds (new tables, new nullable columns, new indexes, new policies)
  - [ ] it only touches this module's own tables
  - [ ] it was dry-run locally in a rolled-back transaction

<!-- A migration that renames, drops or changes existing columns, or touches
     another module's tables, needs to be agreed with the project owner first. -->

## Other modules

- [ ] No new import from another module, **or** the file was added to `PUBLIC_API` in `apps/web/module-boundaries.mjs` and the reason is explained above
