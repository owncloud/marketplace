import { describe, it, expect } from "vitest";
import { parseAppleStats, parsePlayStats, appleLookupUrl, APPLE_APP_ID } from "../src/stores.js";

describe("parseAppleStats", () => {
  // A trimmed iTunes Lookup response (the fields stores.ts reads).
  const lookup = {
    resultCount: 1,
    results: [
      {
        trackName: "ownCloud - File Sync and Share",
        sellerName: "ownCloud GmbH",
        averageUserRating: 4.51592999999999,
        userRatingCount: 345,
        trackViewUrl: "https://apps.apple.com/us/app/owncloud/id1359583808?uo=4",
      },
    ],
  };

  it("maps the first result, rounding the rating to one decimal", () => {
    expect(parseAppleStats(lookup)).toEqual({
      url: "https://apps.apple.com/us/app/owncloud/id1359583808?uo=4",
      rating: 4.5,
      ratingCount: 345,
    });
  });

  it("never reports installs (Apple publishes none)", () => {
    expect(parseAppleStats(lookup)).not.toHaveProperty("installs");
  });

  it("returns null for an empty lookup (unknown id)", () => {
    expect(parseAppleStats({ resultCount: 0, results: [] })).toBeNull();
  });

  it("returns null when the result has no listing URL", () => {
    expect(parseAppleStats({ results: [{ averageUserRating: 4.5 }] })).toBeNull();
  });

  it("omits rating/ratingCount when the fields are missing", () => {
    expect(parseAppleStats({ results: [{ trackViewUrl: "https://x" }] })).toEqual({
      url: "https://x",
    });
  });
});

describe("parsePlayStats", () => {
  // A trimmed google-play-scraper app() result.
  const app = {
    url: "https://play.google.com/store/apps/details?id=com.owncloud.android",
    score: 4.482483,
    scoreText: "4.5",
    ratings: 12000,
    installs: "1,000,000+",
    minInstalls: 1000000,
  };

  it("maps score/ratings/installs, rounding the rating", () => {
    expect(parsePlayStats(app)).toEqual({
      url: "https://play.google.com/store/apps/details?id=com.owncloud.android",
      rating: 4.5,
      ratingCount: 12000,
      installs: "1,000,000+",
    });
  });

  it("returns null when there is no listing URL", () => {
    expect(parsePlayStats({ score: 4.5 })).toBeNull();
  });

  it("omits installs when absent", () => {
    expect(parsePlayStats({ url: "https://x", score: 4 })).toEqual({
      url: "https://x",
      rating: 4,
    });
  });
});

describe("appleLookupUrl", () => {
  it("targets the iTunes lookup endpoint for the ownCloud app id", () => {
    expect(appleLookupUrl()).toBe(`https://itunes.apple.com/lookup?id=${APPLE_APP_ID}`);
  });
});
