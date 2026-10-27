import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Exercise the shipped pagination method and Z policy together. Only its app/data
// boundaries and markup parser are replaced; row ordering and pagination are real.
const built = await build({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../../js/ui/screens/home/homeScreenMethods-29-setup-modern-track-scroll-pagination.js",
        import.meta.url
      )
    )
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "home-pagination-boundaries",
      setup(builder) {
        builder.onResolve(
          { filter: /(?:homeScreenContext|homeDomUpdate|platform\/index)\.js$/ },
          (args) => ({ path: args.path, namespace: "boundary" })
        );
        builder.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
          loader: "js",
          contents: path.endsWith("homeScreenContext.js")
            ? `export const Router={getCurrent:()=>"home"};
             export const catalogRepository={getCatalog:args=>globalThis.homePageHarness.fetch(args)};
             export const buildModernRowKey=row=>row.key;
             export const MODERN_HOME_CONSTANTS={trackPaginationIdleMs:0,trackPaginationPrefetchDelayMs:0,trackPaginationLoadAheadItems:4};
             export const HOME_MAX_ITEMS_PER_ROW_DEFAULT=15;
             export const createPosterCardMarkup=item=>"CARD:"+item.id+";";`
            : path.endsWith("homeDomUpdate.js")
              ? "export const registerHomeDomNodes=()=>{};"
              : "export const Platform={isTizen:()=>globalThis.homePageHarness.tizen};"
        }));
      }
    }
  ]
});
const { createHomeScreenMethods29 } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
);
const items = (from, count) => Array.from({ length: count }, (_, i) => ({ id: String(from + i) }));
const pump = async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  await new Promise((resolve) => setImmediate(resolve));
};

function fixture({ cached = 21, tizen = true, fetch } = {}) {
  const calls = [];
  globalThis.homePageHarness = {
    tizen,
    fetch: async (args) => {
      calls.push(args);
      return fetch ? fetch(args) : { status: "success", data: { items: [], hasMore: false } };
    }
  };
  const card = (id) => ({
    id,
    dataset: {},
    isConnected: true,
    offsetWidth: 212,
    closest: () => track
  });
  const mounted = items(0, 15).map((item) => card(item.id));
  const track = {
    dataset: { trackRowKey: "row" },
    isConnected: true,
    clientWidth: 1000,
    scrollWidth: 3200,
    scrollLeft: 2200,
    querySelectorAll: () => [...mounted],
    appendChild: (fragment) => mounted.push(...fragment.cards),
    addEventListener() {},
    removeEventListener() {}
  };
  globalThis.document = {
    createRange: () => ({
      createContextualFragment: (markup) => {
        const cards = [...markup.matchAll(/CARD:([^;]+);/g)].map((match) => card(match[1]));
        return { cards, querySelectorAll: () => cards };
      }
    })
  };
  globalThis.getComputedStyle = () => ({ columnGap: "24px" });
  const payload = { items: items(0, cached), hasMore: true, nextSkip: cached };
  const screen = {
    ...createHomeScreenMethods29(),
    layoutMode: "modern",
    container: { querySelectorAll: () => [track] },
    rows: [{ key: "row", type: "movie", result: { status: "success", data: payload } }],
    navModel: { rows: [[...mounted]], rowNodesByRowKey: new Map() },
    homeLoadToken: 1,
    getRowItemLimit: () => 15,
    isScrollAnimationActive: () => false,
    scheduleHomeLazyImageHydration() {},
    getNavigationRowSection: () => ({ querySelector: () => track }),
    invalidateNavigationModel() {
      throw Error("Unexpected navigation rebuild");
    }
  };
  screen.setupModernTrackScrollPagination();
  const ahead = async () => {
    screen._trackScrollHandlers
      .get(track)
      .requestAhead({ focusedNode: mounted.at(-1), focusedIndex: mounted.length - 1 });
    await pump();
  };
  return { screen, track, mounted, payload, calls, ahead };
}

test("Tizen appends every cached item in order without changing the initial row or refetching", async () => {
  const f = fixture();
  try {
    assert.equal(f.mounted.length, 15);
    await f.ahead();
    assert.equal(f.mounted.length, 17);
    await f.ahead();
    await f.ahead();
    assert.deepEqual(
      f.mounted.map((card) => card.id),
      items(0, 21).map((item) => item.id)
    );
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.screen.navModel.rows[0], f.mounted);
    assert.deepEqual(
      f.mounted.slice(15).map((card) => card.dataset.navCol),
      ["15", "16", "17", "18", "19", "20"]
    );
  } finally {
    f.screen.teardownModernTrackScrollPagination();
  }
});

test("a provider page keeps its skip and all items while Tizen mounts it over later requests", async () => {
  const f = fixture({
    cached: 15,
    fetch: async () => ({
      status: "success",
      data: { items: items(15, 15), hasMore: true, nextSkip: 30 }
    })
  });
  try {
    await f.ahead();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].skip, 15);
    assert.equal(f.payload.items.length, 30);
    assert.equal(f.payload.nextSkip, 30);
    assert.equal(f.mounted.length, 17);
    for (let i = 0; i < 7; i++) await f.ahead();
    assert.deepEqual(
      f.mounted.map((card) => card.id),
      items(0, 30).map((item) => item.id)
    );
    assert.equal(f.calls.length, 1);
  } finally {
    f.screen.teardownModernTrackScrollPagination();
  }
});

test("non-Tizen pagination retains the existing fifteen-card append", async () => {
  const f = fixture({ cached: 30, tizen: false });
  try {
    await f.ahead();
    assert.equal(f.mounted.length, 30);
    assert.equal(f.calls.length, 0);
  } finally {
    f.screen.teardownModernTrackScrollPagination();
  }
});

test("teardown cancels queued appends and a late provider response cannot append to a retired track", async () => {
  let complete;
  const f = fixture({
    cached: 15,
    fetch: () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  });
  try {
    await f.ahead();
    assert.equal(f.calls.length, 1);
    f.screen.teardownModernTrackScrollPagination();
    f.track.isConnected = false;
    complete({ status: "success", data: { items: items(15, 15), hasMore: false } });
    await pump();
    assert.equal(f.mounted.length, 15);
    assert.equal(f.screen.navModel.rows[0].length, 15);
  } finally {
    f.screen.teardownModernTrackScrollPagination();
  }
  const queued = fixture();
  queued.screen._trackScrollHandlers.get(queued.track).requestAhead();
  queued.screen.teardownModernTrackScrollPagination();
  await pump();
  assert.equal(queued.mounted.length, 15);
});
