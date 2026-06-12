import { describe, it, expect } from "vitest";
import { parseInfoXml } from "../src/info-xml.js";
import { ValidationError } from "../src/types.js";

const VALID = `<?xml version="1.0"?>
<info>
  <id>calendar</id>
  <name>Calendar</name>
  <summary>A calendar</summary>
  <description>A calendar app for ownCloud.</description>
  <licence>AGPL</licence>
  <author>ownCloud GmbH</author>
  <version>2.1.0</version>
  <category>tools</category>
  <category>productivity</category>
  <screenshot>https://example.com/1.png</screenshot>
  <dependencies>
    <owncloud min-version="10.0.0" max-version="10.99.99" />
  </dependencies>
</info>`;

describe("parseInfoXml", () => {
  it("extracts all fields and normalizes repeated category/screenshot", () => {
    const info = parseInfoXml(VALID);
    expect(info.id).toBe("calendar");
    expect(info.name).toBe("Calendar");
    expect(info.version).toBe("2.1.0");
    expect(info.license).toBe("AGPL");
    expect(info.author).toBe("ownCloud GmbH");
    expect(info.categories).toEqual(["tools", "productivity"]);
    expect(info.screenshots).toEqual(["https://example.com/1.png"]);
    expect(info.platformMin).toBe("10.0.0");
    expect(info.platformMax).toBe("10.99.99");
  });

  it("handles a single category (not an array) and no screenshots", () => {
    const xml = VALID.replace("<category>productivity</category>", "").replace(
      "<screenshot>https://example.com/1.png</screenshot>",
      "",
    );
    const info = parseInfoXml(xml);
    expect(info.categories).toEqual(["tools"]);
    expect(info.screenshots).toEqual([]);
  });

  it("rejects missing required <id>", () => {
    const xml = VALID.replace("<id>calendar</id>", "");
    expect(() => parseInfoXml(xml)).toThrow(ValidationError);
    expect(() => parseInfoXml(xml)).toThrow(/missing.*id/i);
  });

  it("rejects missing ownCloud dependency versions", () => {
    const xml = VALID.replace(
      '<owncloud min-version="10.0.0" max-version="10.99.99" />',
      "<owncloud />",
    );
    expect(() => parseInfoXml(xml)).toThrow(/min-version/i);
  });

  it("rejects malformed XML", () => {
    expect(() => parseInfoXml("<info><id>x")).toThrow(ValidationError);
  });
});

describe("parseInfoXml localized text fields", () => {
  it("extracts text from a single localized <name>/<description>", () => {
    const xml = `<?xml version="1.0"?>
<info>
  <id>calendar</id>
  <name lang="en">Calendar</name>
  <summary>A calendar</summary>
  <description lang="en">An app.</description>
  <licence>AGPL</licence>
  <author>ownCloud GmbH</author>
  <version>2.1.0</version>
  <dependencies>
    <owncloud min-version="10.0.0" max-version="10.99.99" />
  </dependencies>
</info>`;
    const info = parseInfoXml(xml);
    expect(info.name).toBe("Calendar");
    expect(info.description).toBe("An app.");
  });

  it("picks the en entry from multiple localized <name> elements", () => {
    const xml = `<?xml version="1.0"?>
<info>
  <id>calendar</id>
  <name lang="en">Calendar</name>
  <name lang="de">Kalender</name>
  <summary>A calendar</summary>
  <description>An app.</description>
  <licence>AGPL</licence>
  <author>ownCloud GmbH</author>
  <version>2.1.0</version>
  <dependencies>
    <owncloud min-version="10.0.0" max-version="10.99.99" />
  </dependencies>
</info>`;
    const info = parseInfoXml(xml);
    expect(info.name).toBe("Calendar");
  });

  it("picks the untagged entry when no en localization is present", () => {
    const xml = `<?xml version="1.0"?>
<info>
  <id>calendar</id>
  <name>Foo</name>
  <name lang="de">Bar</name>
  <summary>A calendar</summary>
  <description>An app.</description>
  <licence>AGPL</licence>
  <author>ownCloud GmbH</author>
  <version>2.1.0</version>
  <dependencies>
    <owncloud min-version="10.0.0" max-version="10.99.99" />
  </dependencies>
</info>`;
    const info = parseInfoXml(xml);
    expect(info.name).toBe("Foo");
  });

  it("still coerces a numeric <version> to a string", () => {
    const xml = `<?xml version="1.0"?>
<info>
  <id>calendar</id>
  <name>Calendar</name>
  <summary>A calendar</summary>
  <description>An app.</description>
  <licence>AGPL</licence>
  <author>ownCloud GmbH</author>
  <version>2</version>
  <dependencies>
    <owncloud min-version="10.0.0" max-version="10.99.99" />
  </dependencies>
</info>`;
    const info = parseInfoXml(xml);
    expect(info.version).toBe("2");
  });
});
