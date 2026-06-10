# humanOS

A web application that helps users build discipline, track deep work, develop skills, and maintain consistent habits.

## Quick Start

- **Prerequisites:** Node.js (16+), npm or pnpm
- Install dependencies:

```bash
npm install
```

- Run the development server:

```bash
npm run dev
```

- Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Project Structure

- **Top level**
	- [index.html](index.html) — app entry
	- [package.json](package.json) — project metadata & scripts
	- [vite.config.ts](vite.config.ts) — Vite configuration

- **Assets**
	- assets/icons/ — app icons
	- assets/sound-effects/ — audio assets

- **Source** (`src/ts`)
	- [main.ts](src/ts/main.ts) — app bootstrap
	- [dashboard.ts](src/ts/dashboard.ts)
	- [deepwork.ts](src/ts/deepwork.ts)
	- [deepwork-page.ts](src/ts/deepwork-page.ts)
	- [habits.ts](src/ts/habits.ts)
	- [habits-page.ts](src/ts/habits-page.ts)
	- [journal-page.ts](src/ts/journal-page.ts)
	- [skills.ts](src/ts/skills.ts)
	- [skills-page.ts](src/ts/skills-page.ts)
	- [tasks.ts](src/ts/tasks.ts)
	- [types.ts](src/ts/types.ts)

## Development Notes

- This project uses Vite and Tailwind CSS (postcss). Development dependencies include `vite`, `typescript`, `tailwindcss`, `postcss`, and `autoprefixer`.
- Scripts available (from `package.json`):

	- `dev` — starts Vite dev server (`vite`)
	- `build` — builds the app for production (`vite build`)
	- `preview` — locally preview the production build (`vite preview`)

## Contributing

File an issue or pull request via the repository: https://github.com/IshanWijekoon/humanOS

## License

This project is licensed under the terms in the repository (`LICENSE`).

