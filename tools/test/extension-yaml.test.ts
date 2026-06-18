import { describe, it, expect } from "vitest";
import { parseExtensionYaml } from "../src/ext/extension-yaml.js";

const VALID = `
id: com.github.owncloud.web-extensions.draw-io
name: Draw.io
subtitle: View and edit draw.io diagram files.
description: |
  A longer description.
license: AGPL-3.0
version: 0.2.0
minOCIS: 6.2.0
authors:
  - name: ownCloud GmbH
    url: https://owncloud.com
tags: [editor, viewer]
resources:
  - url: https://example.com/docs
    label: Docs
`;

describe("parseExtensionYaml", () => {
  it("parses a complete, valid extension.yaml", () => {
    const info = parseExtensionYaml(VALID);
    expect(info.id).toBe("com.github.owncloud.web-extensions.draw-io");
    expect(info.name).toBe("Draw.io");
    expect(info.subtitle).toBe("View and edit draw.io diagram files.");
    expect(info.description).toContain("longer description");
    expect(info.license).toBe("AGPL-3.0");
    expect(info.version).toBe("0.2.0");
    expect(info.minOCIS).toBe("6.2.0");
    expect(info.authors).toEqual([{ name: "ownCloud GmbH", url: "https://owncloud.com" }]);
    expect(info.tags).toEqual(["editor", "viewer"]);
    expect(info.resources).toEqual([{ url: "https://example.com/docs", label: "Docs" }]);
  });

  it("omits optional fields when absent", () => {
    const info = parseExtensionYaml(`
id: com.example.minimal
name: Minimal
subtitle: A minimal extension.
license: MIT
version: 1.0.0
authors:
  - name: Someone
tags: [tools]
`);
    expect(info.description).toBeUndefined();
    expect(info.minOCIS).toBeUndefined();
    expect(info.resources).toBeUndefined();
    expect(info.authors).toEqual([{ name: "Someone" }]);
  });

  it.each(["id", "name", "subtitle", "license", "version"])(
    "rejects when required field %s is missing",
    (field) => {
      const obj: Record<string, string> = {
        id: "com.example.x",
        name: "X",
        subtitle: "s",
        license: "MIT",
        version: "1.0.0",
      };
      delete obj[field];
      const yaml =
        Object.entries(obj)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n") + "\nauthors:\n  - name: A\ntags: [t]\n";
      expect(() => parseExtensionYaml(yaml)).toThrow(new RegExp(field, "i"));
    },
  );

  it("rejects an id that is not reverse-DNS", () => {
    expect(() =>
      parseExtensionYaml(`
id: drawio
name: X
subtitle: s
license: MIT
version: 1.0.0
authors:
  - name: A
tags: [t]
`),
    ).toThrow(/reverse-DNS/i);
  });

  it("accepts a reverse-DNS id with a digit-leading segment", () => {
    const info = parseExtensionYaml(`
id: com.github.sawjan.3dviewer
name: 3D Model Viewer
subtitle: View 3D models.
license: AGPL-3.0
version: 0.1.0
authors:
  - name: Sajan Gurung
tags: [viewer]
`);
    expect(info.id).toBe("com.github.sawjan.3dviewer");
  });

  it("requires at least one author", () => {
    expect(() =>
      parseExtensionYaml(`
id: com.example.x
name: X
subtitle: s
license: MIT
version: 1.0.0
authors: []
tags: [t]
`),
    ).toThrow(/authors/i);
  });

  it("requires at least one tag", () => {
    expect(() =>
      parseExtensionYaml(`
id: com.example.x
name: X
subtitle: s
license: MIT
version: 1.0.0
authors:
  - name: A
tags: []
`),
    ).toThrow(/tags/i);
  });

  it("parses cover, coverCaption and screenshotCaptions", () => {
    const info = parseExtensionYaml(`
id: com.example.x
name: X
subtitle: s
license: MIT
version: 1.0.0
authors:
  - name: A
tags: [t]
cover: true
coverCaption: The cover
screenshotCaptions:
  - First
  - Second
`);
    expect(info.cover).toBe(true);
    expect(info.coverCaption).toBe("The cover");
    expect(info.screenshotCaptions).toEqual(["First", "Second"]);
  });

  it("omits cover/caption fields when absent", () => {
    const info = parseExtensionYaml(`
id: com.example.x
name: X
subtitle: s
license: MIT
version: 1.0.0
authors:
  - name: A
tags: [t]
`);
    expect(info.cover).toBeUndefined();
    expect(info.coverCaption).toBeUndefined();
    expect(info.screenshotCaptions).toBeUndefined();
  });

  it("rejects coverCaption without cover: true", () => {
    expect(() =>
      parseExtensionYaml(`
id: com.example.x
name: X
subtitle: s
license: MIT
version: 1.0.0
authors:
  - name: A
tags: [t]
coverCaption: Orphan caption
`),
    ).toThrow(/coverCaption/i);
  });

  it("rejects non-string screenshotCaptions entries", () => {
    expect(() =>
      parseExtensionYaml(`
id: com.example.x
name: X
subtitle: s
license: MIT
version: 1.0.0
authors:
  - name: A
tags: [t]
screenshotCaptions:
  - 42
`),
    ).toThrow(/screenshotCaptions/i);
  });

  it("rejects malformed YAML", () => {
    expect(() => parseExtensionYaml(":\n  - [unbalanced")).toThrow(/YAML|mapping/i);
  });
});
