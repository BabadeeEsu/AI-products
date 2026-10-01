# Focus — My Productivity Space

A polished, responsive productivity workspace for task planning, sticky notes, and progress tracking. It runs entirely in the browser and keeps data on the current device.

## Features

- Create, edit, delete, complete, prioritize, pin, categorize, and reorder tasks.
- Add descriptions and due dates, with overdue and due-today states.
- Filter by status, priority, and category; sort by custom order, due date, priority, or creation date.
- Search task titles, descriptions, categories, and sticky note content from the global search field.
- Switch between a task list and a three-column Kanban board.
- Create, edit, pin, color, delete, and drag to reorder sticky notes.
- View calculated totals, completion rate, overdue count, daily completions, a weekly chart, and a completion streak.
- Choose light or dark appearance, enable optional due-date notifications, and use keyboard shortcuts.
- Export and import a JSON backup of tasks, notes, preferences, and metadata.

## Technology

Semantic HTML5, CSS3, and vanilla JavaScript. There is no framework, build process, backend, database, or runtime dependency. Google Fonts are an optional enhancement; system fonts are used offline.

## Run locally

Open `index.html` in a modern browser. For a local development server, run `python -m http.server 8000` from the project folder, then visit `http://localhost:8000`.

## Persistence and upgrades

The application stores a versioned JSON object under `focus-productivity.data.v2` in browser local storage. It contains `schemaVersion`, `tasks`, `notes`, `preferences`, and `metadata`. On startup, the app detects the earlier `my-todo-list.tasks.v1` array and migrates its tasks into the current schema without deleting the original legacy key. Data remains specific to the browser profile and device. Clearing browser storage removes the local copy, so export regular backups if the data matters.

## Export and import

Go to **Settings & data** to download a JSON backup or restore from one. Import validates the schema and record shapes first, then asks for confirmation before replacing current tasks, notes, and preferences. Invalid or incompatible files are rejected without replacing existing data.

## Keyboard shortcuts

- **N**: focus the new task field.
- **S**: focus global search.
- **D**: toggle dark mode.
- **Escape**: close an open dialog.

Shortcuts are ignored while focus is in an input, select, textarea, or editable element.

## Development and deployment

The source is organized into `index.html`, `style.css`, and `script.js`, with no compilation step. Make and verify changes on a feature branch, then merge through the repository's normal review workflow. The static files can be deployed to any static hosting provider (including GitHub Pages); there is no server-side component. Deployment is not performed from this local project.

## Limitations

- Browser notifications require support, permission, and a context where the Notification API is available. Reminders are optional, and tasks remain usable without them.
- Notifications are checked while the app is open; a closed page cannot run scheduled reminders.
- Data does not sync across browsers or devices because there is no backend.
- The weekly chart and streak are calculated from completion timestamps stored in task data; legacy tasks have no historical completion timestamp, so their completion date is set to the migration date.
