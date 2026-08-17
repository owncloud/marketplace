# 1.1.0

First marketplace release. Adds AI text to diagram on top of 1.0.0.

- Optional AI "Text to diagram" against any OpenAI-compatible API, disabled by
  default. The API token stays on the server and never reaches the browser;
  requests are metered per user per day, since they are billed to the
  administrator's account. Configurable in Settings → Admin → Additional or
  with `occ excalidraw:ai`.
- The editor bundle URL is keyed on the bundle's timestamp, so browsers pick up
  a new version after an update instead of serving the cached one.

# 1.0.0

- Create and edit Excalidraw whiteboards from the Files app: a "Whiteboard"
  entry in the "+ New" menu, an icon for `.excalidraw` files, and an editor
  that opens on click.
- Autosave shortly after the last change, plus Ctrl/Cmd+S.
- Concurrent-edit protection: a whiteboard changed on the server since it was
  opened is reported, with the choice to overwrite or reload, rather than
  overwritten silently.
- Read-only shares open in view mode, and the server rejects writes from users
  without update permission.
- The Excalidraw bundle and all of its fonts are served by ownCloud itself, so
  the default Content Security Policy needs no exception and no request goes to
  a CDN.
- Opens whiteboards written by the oCIS Excalidraw extension.
